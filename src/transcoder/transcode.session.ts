import Ffmpeg from "fluent-ffmpeg";
import { Preset } from "./transcoder.dto";
import randomstring from 'randomstring';
import fs from 'fs';
import { buildComplexFilters, choosePresetOptions, getEncoder, isImageSubtitleFormat } from "src/utils/filters";
import { dashOutputOptions } from "src/utils/dash";
import { hlsOutputOptions } from "src/utils/hls";
import { httpOutputOptions } from "src/utils/http";
import { getRealDuration } from "src/utils/time";
import path from "path";
import { getStream, pipeWait } from "src/utils/general";
import { TranscoderService } from "./transcoder.service";

class Emitter extends require('events') {
	emit(type, ...args) {
		// console.log(type + ' emitted');
		super.emit(type, ...args);
	}
}

export class TranscodeSession {
	id: string;

	lastActivityTs: number;
	/** Segment length may very depending on the client that is being used. Example: most clients allow 1 second segments for faster loading, but some clients prefer larger segments such as 3 seconds */
	segmentLengthSeconds: number;
	/** Represents the last segment that the transcoder has processed */
	lastTranscodedSegment: number = 0;
	/** Represents the last segment that was seeked to. Used to keep track of segment  */
	lastSeekIndex: number = 0;
	currentPositionIndex: number = 0;
	/** The file url the file that is being transcoded */
	url: string;
	/** Track Idx values */
	audioTrackIdx: number;
	subtitleTrackIdx: number;
	resolution: string;
	bitrate: number; //Bitrate in kbps
	codec: 'h264' | 'hevc';
	preset: Preset;

	segments: {
		[streamId: string]: [
			{
				index: number;
				read: boolean;
			},
		];
	} = {};

	lastRequestedSegment = {}

	/**
	 * The path to the subtitle file that is used in transcoding
	 *
	 * @Optional
	 * */
	folderPath: string;
	paused: boolean = false;
	metadata?: Ffmpeg.FfprobeData;
	type: 'hls' | 'dash' | 'http';

	offset: number = 0; //Timestamp in seconds ffmpeg will seek to
	startIndex: number = 0;

	segmentThrottleSeconds = 240;

	ffmpeg: Ffmpeg.FfmpegCommand = null;

	eventBus = new Emitter();

	constructor ({
		type = <'hls' | 'dash' | 'http'>undefined,
		url = <string>undefined,
		resolution = '1920x1080',
		bitrate = 6000,
		preset = <Preset>'ultrafast',
		codec = <'h264' | 'hevc'>'h264',
		audioTrack = -1,
		subtitleTrack = <number>null,
		sessionId = randomstring.generate(20),
		offset = 0,
		startIndex = 0,
		segmentThrottleSeconds = 240,
		transcodeFolder = '/tmp/transcoder'
	}, private transcoderService: TranscoderService) {
		this.id = sessionId;
		this.type = type;

		this.lastActivityTs = Date.now();
		this.url = url;
		this.offset = offset;
		this.audioTrackIdx = audioTrack;
		this.subtitleTrackIdx = subtitleTrack;
		this.resolution = resolution; // Default resolution if not provided
		this.bitrate = bitrate;
		this.codec = codec;
		this.preset = preset;
		this.segmentLengthSeconds = 5;
		this.segmentThrottleSeconds = segmentThrottleSeconds;
		this.startIndex = type === 'dash' && startIndex == 0 ? 1 : startIndex; //DASH always starts at 1, while HLS starts at 0.
		
		this.folderPath = `${transcodeFolder}/${sessionId}`;
	}

	/*
		Offset (in seconds)
		segment (segment index)
		indexFromStart: sets starting segment to be 0 (or 1 for dash)
	*/
	async start () {
		//If ffmpeg already exists, stop it and reset.
		await this.stop();

		//Fetch source metadata if not already populated
		if (!this.metadata) this.metadata = await this.getFileMetadata();

		console.debug('Getting video metadata...', this.metadata.format)

		//Find video stream
		const videoStream = this.metadata.streams.find((stream) => stream.codec_type == 'video');

		//Create folder
		if (!fs.existsSync(`${this.folderPath}`)) fs.mkdirSync(`${this.folderPath}`, { recursive: true });

		const { type, segmentLengthSeconds, url, subtitleTrackIdx, audioTrackIdx, resolution, codec, preset, id } = this;

		const fpsParsed = videoStream.r_frame_rate.split('/');
		const fps = parseInt(fpsParsed[0]) / parseInt(fpsParsed[1]);
		//Calculate keyframe interval depending on fps
		const keyFrameInterval = Math.round(fps * segmentLengthSeconds);

		this.lastActivityTs = Date.now();

		console.debug(`[${this.id}] Starting at offset: ${this.offset}`);

		let throttleTimeout = false;

		this.ffmpeg = Ffmpeg(url, { cwd: `${this.folderPath}` })
			.inputOptions(
				[
					// '-loglevel debug',
					'-analyzeduration 20000000',
					'-probesize 20000000',
					...(process.env.TRANSCODE_TYPE === 'nvenc'
						? ['-hwaccel auto']
						: process.env.TRANSCODE_TYPE === 'vaapi'
							? ['-hwaccel auto']
							: []),
					// '-hwaccel_output_format cuda', //CUDA
					this.offset > 0 ? `-ss ${this.offset}` : undefined,
					'-reconnect 1',
					// '-reconnect_at_eof 1',
					// '-reconnect_streamed 1',
					// '-reconnect_delay_max 4294',
				].filter((arg) => arg),
			)
			.output(type == 'dash' ? `manifest.mpd` : type == 'hls' ? `%d.ts` : '%d.mkv')
			.complexFilter(buildComplexFilters(this))
			.map('video')
			.map('audio')
			// .audioCodec('libopus')
			.audioCodec('libfdk_aac')
			// .audioChannels(this.metadata.streams.find((stream) => stream.index === this.audioTrackIdx).channels)
			.audioBitrate('192k')
			.videoCodec(getEncoder(codec))
			.withVideoBitrate(`${this.bitrate}k`)
			.withFPS(Math.round(fps))
			.outputOptions(
				[
					'-profile:a aac_low',
					choosePresetOptions(preset),
					subtitleTrackIdx ? `-map_inlineass 0:${subtitleTrackIdx}` : null,
					'-forced-idr:0 1',
					`-maxrate:v ${this.bitrate}k`,
					`-bufsize:v ${this.bitrate/2}k`,
					`-g:v ${keyFrameInterval}`,
					`-keyint_min:v ${keyFrameInterval}`,
					// '-force_key_frames:v expr:gte(t,n_forced*1)',
					...(type == 'dash'
						? dashOutputOptions(this)
						: type == 'hls'
							? hlsOutputOptions(this)
							: httpOutputOptions(this)),
					'-map_chapters -1',
					'-avoid_negative_ts disabled',
					'-start_at_zero',
					'-copyts',
					'-y',
				].filter((arg) => arg),
			);

		if (subtitleTrackIdx && !isImageSubtitleFormat(getStream(this.metadata, subtitleTrackIdx)))
			this.ffmpeg
				.output('nullfile')
				.outputOptions(
					[
						subtitleTrackIdx ? `-map 0:${subtitleTrackIdx}` : null,
						'-f null',
						subtitleTrackIdx ? `-codec ass` : null,
						'-avoid_negative_ts disabled',
						'-start_at_zero',
						'-copyts',
					].filter((arg) => arg),
				);

		this.ffmpeg
			.on('start', function (commandLine) {
				console.debug(`[${this.id}] Starting ffmpeg...`, commandLine);
				// fs.appendFileSync(`logs/${id}`, 'Spawned Ffmpeg with command: ' + commandLine + '\n');
			})
			.on(
				'progress',
				(async (progress) => {
					const { currentPositionIndex, lastSeekIndex, segmentLengthSeconds, ffmpeg } = this;

					const currentTimemark = getRealDuration(lastSeekIndex, segmentLengthSeconds, progress.timemark);
					const segmentIndex = Math.ceil(currentTimemark / segmentLengthSeconds);

					this.lastTranscodedSegment = segmentIndex;

					if (this.segmentThrottleSeconds > 0) {

						const throttle = (segmentIndex - Math.max(lastSeekIndex, currentPositionIndex)) * segmentLengthSeconds >= this.segmentThrottleSeconds;

						if (throttle && !throttleTimeout) {
							console.debug(
								`[${this.id}] Session throttled... ${(segmentIndex - Math.max(lastSeekIndex, currentPositionIndex)) * segmentLengthSeconds >= this.segmentThrottleSeconds} >= ${this.segmentThrottleSeconds}`,
							);
							await this.pause();

							throttleTimeout = true;
							setTimeout(() => {
								throttleTimeout = false;
							}, 5000);
						}
						
					}

					console.debug(
						`[${this.id}] Transcode Progress - `,
						'Current Timemark:',
						currentTimemark,
						' Current Segment:',
						segmentIndex,
						'Current Player Position:',
						currentPositionIndex,
						'Segment Throttle Seconds',
						(segmentIndex - Math.max(lastSeekIndex, currentPositionIndex)) * segmentLengthSeconds,
					);
				}).bind(this),
			)
			// .size('?x360')
			// .size('?x1080')
			.on('error', (e) => {
				console.error(e);
			})
			.on('stderr', function (stderrLine) {
				console.debug(stderrLine)
				// fs.appendFileSync(`logs/${id}`, stderrLine + '\n');
			})
			.on('end', () => {
				console.debug(`[${this.id}] Transcode finished.`);
			})
			// .output(type == 'dash' ? `manifest` : type == 'hls' ? `%d.ts` : '%d.mkv')
			.run();

			this.eventBus.emit('ready');
	}

	async waitForStart () {
		if (this.ffmpeg || this.metadata) return;
		return new Promise<void>((resolve, reject) => {
			this.eventBus.once('ready', () => {
				resolve()
			});
		})
	}
	
	async seek(segmentIndex) {
		await this.stop();
		this.startIndex = segmentIndex
		this.offset = segmentIndex * this.segmentLengthSeconds

		this.lastSeekIndex = segmentIndex;
		this.currentPositionIndex = segmentIndex;
		await this.start()
	}

	async pause () {
		this.ffmpeg?.kill('SIGSTOP');
		this.paused = true;
		console.debug(`[${this.id}] Session paused`);
	}

	async resume () {
		this.ffmpeg?.kill('SIGCONT');
		this.paused = false;
		console.debug(`[${this.id}] Session resumed`);
	}

	async stop () {
		console.debug(`[${this.id}] Stopping session`);
		this.segments = {};

		this.ffmpeg?.kill('SIGKILL')

		if (fs.existsSync(`${this.folderPath}`))
			fs.rmSync(`${this.folderPath}`, { recursive: true, force: true });

		console.debug(`[${this.id}] Stopped session`);
	}

	async restart () {
		console.debug(`[${this.id}] Session restarting`);
		await this.seek(this.currentPositionIndex);
		console.debug(`[${this.id}] Session restarted`);
	}

	segmentComplete (streamIndex: number, segmentIndex: number) {
		let segments = this.segments[streamIndex];
		if (!segments) segments = this.segments[streamIndex] = [] as any;

		console.debug(`[${this.id}] Segment complete (Stream: ${streamIndex} Segment: ${segmentIndex})`);
		this.eventBus.emit(`segmentComplete-${streamIndex}-${segmentIndex}`);
		segments.push({
			index: segmentIndex,
			read: false,
		});
	}

	markSegmentAsRead(streamIndex: number = 0, segmentIndex: number) {
		// let index = Object.values(this.sessions[sessionId].segments).findIndex((seg) => seg.index == segmentIndex && seg.stream == streamIndex);
		const index = this.segments[streamIndex].findIndex((stream) => stream.index == segmentIndex);
		this.lastActivityTs = Date.now();
		this.segments[streamIndex][index] = {
			index: segmentIndex,
			read: true,
		};
	}

	async getSegment(streamIndex: number = 0, segmentIndex: number, outputStream) {
		this.lastActivityTs = Date.now();

		const segmentPath =
			this.type == 'dash'
				? path.join(this.folderPath, `${streamIndex}-${segmentIndex}.m4s`)
				: this.type == 'hls'
					? path.join(this.folderPath, `${segmentIndex}.ts`)
					: path.join(this.folderPath, `${segmentIndex}.mkv`);

		// if (session.currentPositionIndex + 1 == parseInt(params.segment)) {
		if (this.paused && this.segmentThrottleSeconds > 0) {
			if (this.lastTranscodedSegment - segmentIndex <= 10) {
				await this.resume()
			}
		}

		if (
			// fs.existsSync(segmentPath) ||
			Math.abs((this.lastRequestedSegment[streamIndex] || 0) - segmentIndex) <= 5 || //Only seek if segment fetch threshold is greater than this amount
			this.type == 'http'
		) {
			this.lastRequestedSegment[streamIndex] = segmentIndex;

			await this.waitForSegment(streamIndex, segmentIndex);
			// this.markSegmentAsRead(streamIndex, segmentIndex);
			await pipeWait(fs.createReadStream(segmentPath), outputStream);
		} else if (streamIndex == 0) {
			this.lastRequestedSegment[streamIndex] = segmentIndex;
			await this.seek(segmentIndex);
			await this.waitForSegment(streamIndex, segmentIndex);
			// this.markSegmentAsRead(streamIndex, segmentIndex);
			await pipeWait(fs.createReadStream(segmentPath), outputStream);
		} else {
			await this.waitForSegment(streamIndex, segmentIndex);
			// this.markSegmentAsRead(streamIndex, segmentIndex);
			await pipeWait(fs.createReadStream(segmentPath), outputStream);
		}

		this.currentPositionIndex = segmentIndex;

		// fs.rmSync(segmentPath);
	}

	waitForSegment(streamIndex, segmentIndex = 0) {
		return new Promise<void>((resolve, reject) => {
			if (this.segments[streamIndex]?.find((segment) => segment.index === segmentIndex) !== undefined) {
				// console.debug(`Message: Segment found`, this.segments[streamIndex]?.find((segment) => segment.index === segmentIndex))
				return resolve();
			}
			this.eventBus.once(`segmentComplete-${streamIndex}-${segmentIndex}`, () => {
				// console.debug(`Message: segmentComplete-${streamIndex}-${segmentIndex} - Event Bus`)
				resolve()
			});
		});
	}

	async getFileMetadata(): Promise<Ffmpeg.FfprobeData> {
		if (this.metadata) return this.metadata;

		this.metadata = await this.transcoderService.getMetadata(this.url);

		return this.metadata;
	}
}