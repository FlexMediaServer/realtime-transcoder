import { Injectable } from '@nestjs/common';
import Ffmpeg from 'fluent-ffmpeg';
import randomstring from 'randomstring';
import fs from 'fs';
import path from 'path';
import { hlsOutputOptions } from 'src/utils/hls';
import { dashOutputOptions } from 'src/utils/dash';
import { getRealDuration } from 'src/utils/time';

export type TranscoderSession = {
	/** Randomly generated 20 digit string to identify the transcoder session */
	id: string;
	/** Segment length may very depending on the client that is being used. Example: most clients allow 1 second segments for faster loading, but some clients prefer larger segments such as 3 seconds */
	segmentLengthSeconds: number;
	/** Represents the last segment that the transcoder has processed */
	lastSegementIndex: number;
	/** Represents the last segment that was seeked to. Used to keep track of segment  */
	lastSeekIndex: number;
	currentPositionIndex: number;
	/** The file url the file that is being transcoded */
	url: string;
	/** 
	 * The path to the subtitle file that is used in transcoding 
	 * 
	 * @Optional
	 * */
	subtitlePath?: string;
	folderPath: string;
	throttled: boolean;
	metadata: Ffmpeg.FfprobeData
	type: 'hls' | 'dash'
	
	ffmpeg: any
};

export type TranscoderSessionStore = {
	/** id is the session ID from the stored sessions */
	[id: string]: TranscoderSession
}

export const segmentThrottleSeconds = 120;

@Injectable()
export class TranscoderService {

	sessions: TranscoderSessionStore = {}
	transcodeFolder = "/dev/shm"

	async startSession(type: 'hls' | 'dash', url, audioTrack = 0, subtitleTrack = null) {
		let sessionId = randomstring.generate(20);

		let metadata = await this.getVideoMetadata(url)

		fs.mkdirSync(`${this.transcodeFolder}/${sessionId}`)

		let subtitlePath;
		if (subtitleTrack) {
			subtitlePath = await this.extractSubtitles(url, sessionId, subtitleTrack, metadata)
		}

		this.sessions[sessionId] = {
			id: sessionId,
			url: url,
			segmentLengthSeconds: 1,
			metadata,
			subtitlePath,
			folderPath: `${this.transcodeFolder}/${sessionId}`,
			lastSegementIndex: 0,
			lastSeekIndex: 0,
			currentPositionIndex: 0,
			throttled: false,

			//ffmpeg -i "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" -c:v libx264 -force_key_frames "expr:gte(t,n_forced*3)" -copyts -avoid_negative_ts disabled -max_muxing_queue_size 2048 -f hls -max_delay 5000000 -hls_time 3 -hls_segment_type fmp4 -hls_fmp4_init_filename "init.mp4" -start_number 0 -hls_segment_filename "%d.mp4" -hls_playlist_type vod -hls_list_size 0 -y "main.m3u8"
			type,
			
			ffmpeg: null
		}

		this.sessions[sessionId].ffmpeg = this.startFfmpeg(sessionId, 0);

		return this.sessions[sessionId];
	}

	getSession (sessionId) { return this.sessions[sessionId]; }

	extractSubtitles (url, sessionId, streamIdx, metadata: Ffmpeg.FfprobeData) {
		const stream = metadata.streams.find((stream) => stream.index == streamIdx);
		return new Promise((resolve, reject) => {
			Ffmpeg(url)
				.outputOptions([
					`-map 0:${streamIdx}`
				])
				.on('end', () => resolve(`${this.transcodeFolder}/${sessionId}-subtitle.${stream.codec_name}`))
				.on('error', reject)
				.save(`${this.transcodeFolder}/${sessionId}-subtitle.${stream.codec_name}`)
		})
	}

	startFfmpeg (sessionId, segmentIndex = 0) {
		const { type, segmentLengthSeconds, url, subtitlePath } = this.sessions[sessionId];
		let throttleTimeout = false;
		return Ffmpeg(url)
			.inputOptions([
				'-analyzeduration 20000000',
				'-probesize 20000000',
				'-hwaccel cuda', '-hwaccel_output_format cuda', //CUDA
				segmentIndex !== 0 && type == 'hls' ? `-ss ${segmentIndex * segmentLengthSeconds}` : 
				segmentIndex !== 0 && type == 'dash' ? `-ss ${segmentIndex - 1 * segmentLengthSeconds}` : undefined
			].filter(arg => arg))
			.outputOptions([
				'-map 0:v:0', '-map 0:a:0',
				'-codec:v h264_nvenc', //CUDA
				'-codec:a aac',
				'-forced-idr:0 1',
				`-vf scale_cuda=w=-2:h=360:format=yuv420p${subtitlePath ? `,hwdownload,subtitles=${subtitlePath}` : ''}`, //CUDA specific
				// '-force_key_frames:0 "expr:gte(t,n_forced*1)"',
				'-g 24', '-keyint_min 24',
				...(type == 'dash' ? dashOutputOptions(segmentIndex, segmentLengthSeconds) : hlsOutputOptions(segmentIndex, segmentLengthSeconds)),
				'-map_metadata -1', '-map_chapters -1',
				'-avoid_negative_ts disabled', '-start_at_zero', '-copyts',
				// '-progress http://localhost:32402/transcoder/progress',
				'-y'
			].filter(arg => arg))
			.on('start', function(commandLine) {
				console.log('Spawned Ffmpeg with command: ' + commandLine);
			})
			.on('progress', ((progress) => {
				const { currentPositionIndex, lastSeekIndex, segmentLengthSeconds, ffmpeg } = this.sessions[sessionId];

				const currentTimemark = getRealDuration(lastSeekIndex, segmentLengthSeconds, progress.timemark);
				const segmentIndex =  Math.ceil(currentTimemark/segmentLengthSeconds)

				this.sessions[sessionId].lastSegementIndex = segmentIndex;

				const throttle = (segmentIndex-currentPositionIndex) >= (segmentThrottleSeconds * segmentLengthSeconds)

				if (throttle && !throttleTimeout) {
					console.log(`Session ${sessionId} throttled... ${segmentIndex-currentPositionIndex} >= ${segmentThrottleSeconds * segmentLengthSeconds}`)
					ffmpeg.kill('SIGSTOP');
					this.sessions[sessionId].throttled = true;

					throttleTimeout = true;
					setTimeout(() => {
						throttleTimeout = false;
					}, 5000)
				}

				console.log('Current Timemark:', currentTimemark, ' Current Segment:', segmentIndex, 'Current Player Position:', currentPositionIndex);
			}).bind(this))
			// .size('?x360')
			// .size('?x1080')
			.on('error', (e) => {
				console.error(e)
			})
			.on('end', () => {
				console.log('Transcode finished.')
			})
			.output(type == 'dash' ? `${this.transcodeFolder}/${sessionId}/dash` : `${this.transcodeFolder}/${sessionId}/%d.ts`)
			.run()
	} 

	async seek(sessionId, segmentIndex) {
		const session = this.sessions[sessionId];
		session.ffmpeg.kill();

		for (const file of fs.readdirSync(`${this.transcodeFolder}/${sessionId}`)) {
			fs.unlinkSync(path.join(`${this.transcodeFolder}/${sessionId}`, file));
		}

		session.ffmpeg = this.startFfmpeg(sessionId, segmentIndex);
		session.lastSeekIndex = segmentIndex;
		session.currentPositionIndex = segmentIndex;
	}

	getVideoMetadata (url): Promise<Ffmpeg.FfprobeData> {
		return new Promise<Ffmpeg.FfprobeData>((resolve, reject) => {
			Ffmpeg.ffprobe(url, function(err, metadata) {
				if (err) return reject(err)
				resolve(metadata)
			});
		});
	}

	async waitForFile(filePath: string, interval = 1000): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const checkFile = () => {
				fs.stat(filePath, (err, stats) => {
					if (!err && stats.size > 0) {
						resolve();
					} else if (err && err.code === "ENOENT") {
						setTimeout(checkFile, interval);
					} else {
						setTimeout(checkFile, interval);
					}
				});
			};
			checkFile();
		});
	}

	waitForSegments (type: 'hls' | 'dash', sessionId, segmentIndex = 0, segmentAdvance = 1) {
		return Promise.all(Array.from({length: segmentAdvance}, (_, i) => i).map((seg) => {
			return type == 'hls' ? this.waitForFile(`${this.transcodeFolder}/${sessionId}/${seg + segmentIndex}.ts`) : this.waitForFile(`${this.transcodeFolder}/${sessionId}/chunk-stream0-${seg + segmentIndex}.m4s`)
		}))
	}
}