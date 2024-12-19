import { Injectable } from '@nestjs/common';
import Ffmpeg from 'fluent-ffmpeg';
import randomstring from 'randomstring';
import fs from 'fs';
import path from 'path';
import { hlsOutputOptions } from 'src/utils/hls';
import { dashOutputOptions } from 'src/utils/dash';
import { getRealDuration } from 'src/utils/time';
import { httpOutputOptions } from 'src/utils/http';
import { pipeWait, waitForFile } from 'src/utils/general';
import { EventEmitter } from 'stream';

export type TranscoderSession = {
	/** Randomly generated 20 digit string to identify the transcoder session */
	id: string;
	/** Segment length may very depending on the client that is being used. Example: most clients allow 1 second segments for faster loading, but some clients prefer larger segments such as 3 seconds */
	segmentLengthSeconds: number;
	/** Represents the last segment that the transcoder has processed */
	lastSegmentIndex: number;
	/** Represents the last segment that was seeked to. Used to keep track of segment  */
	lastSeekIndex: number;
	currentPositionIndex: number;
	/** The file url the file that is being transcoded */
	url: string;
	/** Track Idx values */
	audioTrackIdx: number;
	subtitleTrackIdx: number;

	lastRequestedSegment: {
		[stream: string]: number;
	};

	segments: {
		[key: string]: {
			stream: number;
			index: number;
			read: boolean;
		};
	};
	/**
	 * The path to the subtitle file that is used in transcoding
	 *
	 * @Optional
	 * */
	folderPath: string;
	throttled: boolean;
	metadata?: Ffmpeg.FfprobeData;
	type: 'hls' | 'dash' | 'http';

	offset: number;

	ffmpeg: any;
};

export type TranscoderSessionStore = {
	/** id is the session ID from the stored sessions */
	[id: string]: TranscoderSession;
};

export const segmentThrottleSeconds = 120;

@Injectable()
export class TranscoderService {
	sessions: TranscoderSessionStore = {};
	transcodeFolder = '/dev/shm';

	eventBus = new EventEmitter();

	segmentComplete(sessionId, streamIndex, segmentIndex) {
		this.eventBus.emit(`segmentComplete-${sessionId}-${streamIndex}-${segmentIndex}`);
		this.sessions[sessionId].segments[`${streamIndex}-${segmentIndex}`] = {
			stream: streamIndex,
			index: segmentIndex,
			read: false,
		};
	}

	async startSession(type: 'hls' | 'dash' | 'http', url, audioTrack = -1, subtitleTrack = null, sessionId = randomstring.generate(20), offset = 0) {
		let session = this.getSession(sessionId);
		if (session) {
			session.ffmpeg.kill();
			fs.rmSync(session.folderPath, { recursive: true, force: true });
		}

		this.sessions[sessionId] = {
			id: sessionId,

			url: url,
			offset: offset,
			audioTrackIdx: audioTrack,
			subtitleTrackIdx: subtitleTrack,

			segmentLengthSeconds: 1,
			metadata: session ? session.metadata : await this.getVideoMetadata(url),
			// subtitlePath,
			folderPath: `${this.transcodeFolder}/${sessionId}`,
			lastSegmentIndex: 0,
			lastSeekIndex: 0,
			currentPositionIndex: 0,
			throttled: false,

			lastRequestedSegment: {},
			segments: {},

			//ffmpeg -i "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" -c:v libx264 -force_key_frames "expr:gte(t,n_forced*3)" -copyts -avoid_negative_ts disabled -max_muxing_queue_size 2048 -f hls -max_delay 5000000 -hls_time 3 -hls_segment_type fmp4 -hls_fmp4_init_filename "init.mp4" -start_number 0 -hls_segment_filename "%d.mp4" -hls_playlist_type vod -hls_list_size 0 -y "main.m3u8"
			type,

			ffmpeg: null,
		};

		let metadata = this.sessions[sessionId].metadata;

		if (!fs.existsSync(`${this.transcodeFolder}/${sessionId}`)) fs.mkdirSync(`${this.transcodeFolder}/${sessionId}`);

		this.sessions[sessionId].metadata = metadata;
		this.sessions[sessionId].ffmpeg = this.startFfmpeg(sessionId, 0);

		return this.sessions[sessionId];
	}

	getSession(sessionId) {
		return this.sessions[sessionId];
	}

	extractSubtitles(url, sessionId, streamIdx, metadata: Ffmpeg.FfprobeData) {
		const stream = metadata.streams.find((stream) => stream.index == streamIdx);
		return new Promise((resolve, reject) => {
			Ffmpeg(url)
				.outputOptions([`-map 0:${streamIdx}`])
				.on('start', (command) => {
					console.log(command);
				})
				.on('end', () => resolve(`${this.transcodeFolder}/${sessionId}-subtitle.${stream.codec_name}`))
				.on('error', reject)
				.save(`${this.transcodeFolder}/${sessionId}-subtitle.${stream.codec_name}`);
		});
	}

	startFfmpeg(sessionId, segmentIndex = 0) {
		const { type, segmentLengthSeconds, url, subtitleTrackIdx, audioTrackIdx, offset } = this.sessions[sessionId];
		let throttleTimeout = false;

		if (offset) segmentIndex = Math.floor(offset / segmentLengthSeconds);

		console.log(segmentIndex);

		let ffmpeg = Ffmpeg(url, { cwd: `${this.transcodeFolder}/${sessionId}` })
			.inputOptions(
				[
					'-analyzeduration 20000000',
					'-probesize 20000000',
					'-hwaccel cuda',
					'-hwaccel_output_format cuda', //CUDA
					segmentIndex !== 0 && type == 'hls'
						? `-ss ${segmentIndex * segmentLengthSeconds}`
						: segmentIndex !== 0 && type == 'dash'
							? `-ss ${segmentIndex - 1 * segmentLengthSeconds}`
							: offset > 0
								? `-ss ${offset}`
								: undefined,
					'-reconnect 1',
					'-reconnect_at_eof 1',
					'-reconnect_streamed 1',
					'-reconnect_delay_max 4294',
				].filter((arg) => arg),
			)
			.output(type == 'dash' ? `manifest` : type == 'hls' ? `%d.ts` : '%d.mkv')
			.outputOptions(
				[
					// '-map 0:v:0',
					subtitleTrackIdx ? `-map_inlineass 0:${subtitleTrackIdx}` : null,
					// `-vf scale_cuda=w=-2:h=1080:format=nv12${subtitleTrackIdx ? `,hwdownload,format=nv12,inlineass=font_scale=1.250000:font_path=/home/blakebuell/Development/realtime-transcoder/assets/NotoSans-Medium.otf:fontconfig_file=/home/blakebuell/Development/realtime-transcoder/assets/fonts.conf:language=en` : ''}`, //CUDA specific
					`-filter_complex [0:v:0]scale_cuda=w=-2:h=1080:format=nv12[1];[1]hwdownload,format=nv12[2]${subtitleTrackIdx ? `;[2]inlineass=font_scale=1.250000:font_path=/home/blakebuell/Development/realtime-transcoder/assets/NotoSans-Medium.otf:fontconfig_file=/home/blakebuell/Development/realtime-transcoder/assets/fonts.conf:language=en[3]` : ''}`,
					subtitleTrackIdx ? '-map [3]' : '-map [2]',

					'-codec h264_nvenc',
					'-preset p5', //CUDA
					'-forced-idr 1',
					'-b 4000k',
					'-g 24',
					'-keyint_min 24',

					audioTrackIdx == -1 ? '-map 0:a:0' : `-map 0:${audioTrackIdx}`,
					`-codec:a aac`,
					`-ac:a 2`,

					// '-force_key_frames:0 "expr:gte(t,n_forced*1)"',
					...(type == 'dash'
						? dashOutputOptions(sessionId, segmentIndex, segmentLengthSeconds)
						: type == 'hls'
							? hlsOutputOptions(sessionId, segmentIndex, segmentLengthSeconds)
							: httpOutputOptions(sessionId, segmentLengthSeconds)),
					'-map_metadata -1',
					'-map_chapters -1',
					'-avoid_negative_ts disabled',
					'-start_at_zero',
					'-copyts',

					'-progress http://localhost:32402/transcoder/test/progress',
					'-progressurl http://localhost:32402/transcoder/test/progress_url',
					'-y',
				].filter((arg) => arg),
			);

		if (subtitleTrackIdx)
			ffmpeg
				.output('nullfile')
				.outputOptions(
					[subtitleTrackIdx ? `-map 0:${subtitleTrackIdx}` : null, '-f null', subtitleTrackIdx ? `-codec ass` : null].filter((arg) => arg),
				);

		ffmpeg
			.on('start', function (commandLine) {
				console.log('Spawned Ffmpeg with command: ' + commandLine);
			})
			.on(
				'progress',
				((progress) => {
					const { currentPositionIndex, lastSeekIndex, segmentLengthSeconds, ffmpeg } = this.sessions[sessionId];

					const currentTimemark = getRealDuration(lastSeekIndex, segmentLengthSeconds, progress.timemark);
					const segmentIndex = Math.ceil(currentTimemark / segmentLengthSeconds);

					this.sessions[sessionId].lastSegmentIndex = segmentIndex;

					const throttle = segmentIndex - currentPositionIndex >= segmentThrottleSeconds * segmentLengthSeconds;

					if (throttle && !throttleTimeout) {
						console.log(
							`Session ${sessionId} throttled... ${segmentIndex - currentPositionIndex} >= ${segmentThrottleSeconds * segmentLengthSeconds}`,
						);
						ffmpeg.kill('SIGSTOP');
						this.sessions[sessionId].throttled = true;

						throttleTimeout = true;
						setTimeout(() => {
							throttleTimeout = false;
						}, 5000);
					}

					console.log(
						'Current Timemark:',
						currentTimemark,
						' Current Segment:',
						segmentIndex,
						'Current Player Position:',
						currentPositionIndex,
					);
				}).bind(this),
			)
			// .size('?x360')
			// .size('?x1080')
			.on('error', (e) => {
				console.error(e);
			})
			.on('stderr', function (stderrLine) {
				// console.log('Stderr output: ' + stderrLine);
			})
			.on('end', () => {
				console.log('Transcode finished.');
			})
			// .output(type == 'dash' ? `manifest` : type == 'hls' ? `%d.ts` : '%d.mkv')
			.run();

		return ffmpeg;
	}

	async seek(sessionId, segmentIndex) {
		console.log(`Seek to ${segmentIndex}`);
		const session = this.sessions[sessionId];
		session.ffmpeg.kill();

		for (const file of fs.readdirSync(`${this.transcodeFolder}/${sessionId}`)) {
			fs.unlinkSync(path.join(`${this.transcodeFolder}/${sessionId}`, file));
		}

		session.ffmpeg = this.startFfmpeg(sessionId, segmentIndex);
		session.lastSeekIndex = segmentIndex;
		session.currentPositionIndex = segmentIndex;
		session.segments = {};
	}

	markSegmentAsRead(sessionId, streamIndex: number = 0, segmentIndex: number) {
		// let index = Object.values(this.sessions[sessionId].segments).findIndex((seg) => seg.index == segmentIndex && seg.stream == streamIndex);
		this.sessions[sessionId].segments[`${streamIndex}-${segmentIndex}`].read = true;
	}

	getLastReadSegment(sessionId, streamIndex: number = 0) {
		let segments = Object.values(this.sessions[sessionId].segments)
			.filter((seg) => seg.stream == streamIndex && seg.read == true)
			.sort((a, b) => b.index - a.index);
		return segments[0];
	}

	async getSegment(sessionId, streamIndex: number = 0, segmentIndex: number, outputStream) {
		const session = this.getSession(sessionId);

		const segmentPath =
			session.type == 'dash'
				? path.join(session.folderPath, `chunk-stream${streamIndex}-${segmentIndex}.m4s`)
				: session.type == 'hls'
					? path.join(session.folderPath, `${segmentIndex}.ts`)
					: path.join(session.folderPath, `${segmentIndex}.mkv`);

		// if (session.currentPositionIndex + 1 == parseInt(params.segment)) {
		if (session.throttled) {
			if (session.lastSegmentIndex - segmentIndex <= 10) {
				console.log(`Session ${session.id} resumed`);
				session.ffmpeg.kill('SIGCONT');
				session.throttled = false;
			}
		}

		console.log(streamIndex);

		if (
			Math.abs((session.lastRequestedSegment[streamIndex] || 0) - segmentIndex) <= 5 || //Only seek if segment fetch threshold is greater than this amount
			session.type == 'http'
		) {
			session.lastRequestedSegment[streamIndex] = segmentIndex;

			await this.waitForSegment(sessionId, streamIndex, segmentIndex);
			this.markSegmentAsRead(sessionId, streamIndex, segmentIndex);
			await pipeWait(fs.createReadStream(segmentPath), outputStream);
		} else if (streamIndex == 0) {
			session.lastRequestedSegment[streamIndex] = segmentIndex;
			await this.seek(sessionId, segmentIndex);
			await this.waitForSegment(sessionId, streamIndex, segmentIndex);
			await pipeWait(fs.createReadStream(segmentPath), outputStream);
		} else {
			await this.waitForSegment(sessionId, streamIndex, segmentIndex);
			await pipeWait(fs.createReadStream(segmentPath), outputStream);
		}

		session.currentPositionIndex = segmentIndex;

		// fs.rmSync(segmentPath);
	}

	getVideoMetadata(url): Promise<Ffmpeg.FfprobeData> {
		return new Promise<Ffmpeg.FfprobeData>((resolve, reject) => {
			Ffmpeg.ffprobe(url, function (err, metadata) {
				if (err) return reject(err);
				resolve(metadata);
			});
		});
	}

	waitForSegment(sessionId, streamIndex, segmentIndex = 0) {
		const session = this.getSession(sessionId);

		return new Promise<void>((resolve, reject) => {
			if (session.segments[`${streamIndex}-${segmentIndex}`]) return resolve();
			this.eventBus.once(`segmentComplete-${sessionId}-${streamIndex}-${segmentIndex}`, resolve);
		});
	}
}
