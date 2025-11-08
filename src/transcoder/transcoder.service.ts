/* eslint-disable @typescript-eslint/no-require-imports */
import { Injectable, Options } from '@nestjs/common';
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
import { TranscoderSessionStore } from './transcoder.types';
import { buildScaleFilter, buildSubtitleFilterInlineass, choosePresetOptions, getEncoder, isHardware } from 'src/utils/filters';
import { vaapiPresetOptions } from 'src/utils/hwaccel/vaapi';
import { cudaPresetOptions } from 'src/utils/hwaccel/cuda';
import { Preset } from './transcoder.dto';

export const segmentThrottleSeconds = 240;

class Emitter extends require('events') {
	emit(type, ...args) {
		// console.log(type + ' emitted');
		super.emit(type, ...args);
	}
}

@Injectable()
export class TranscoderService {
	sessions: TranscoderSessionStore = {};
	transcodeFolder = process.env.TRANSCODE_FOLDER || '/tmp';

	eventBus = new Emitter();

	fillSegments(sessionId, streamIndex, startSegmentIndex: number, endSegmentIndex: number) {
		const segments = this.sessions[sessionId].segments[`${streamIndex}`];

		for (const index of Array.from({ length: endSegmentIndex - startSegmentIndex }, (_, i) => i + startSegmentIndex)) {
			this.eventBus.emit(`segmentComplete-${sessionId}-${streamIndex}-${index}`);
			segments.push({
				index: index,
				read: false,
			});
		}
	}

	segmentComplete(sessionId: string, streamIndex: number, segmentIndex: number) {
		let segments = this.sessions[sessionId].segments[`${streamIndex}`];
		if (!segments) segments = this.sessions[sessionId].segments[`${streamIndex}`] = [] as any;

		const lastSegment = segments ? segments[segments.length - 1] : undefined;
		//ffmpeg sometimes misses a segment on the progress reporting. This just fills in the blanks.
		if (lastSegment && segmentIndex - lastSegment?.index > 1 && segmentIndex - lastSegment?.index < 3) {
			console.log(`Filling segment range: ${lastSegment.index + 1} - ${segmentIndex - 1}`);
			this.fillSegments(sessionId, streamIndex, lastSegment.index + 1, segmentIndex);
		}

		this.eventBus.emit(`segmentComplete-${sessionId}-${streamIndex}-${segmentIndex}`);
		segments.push({
			index: segmentIndex,
			read: false,
		});
	}

	/*
	: {
		type: 'hls' | 'dash' | 'http', 
		url: string, 
		audioTrack = -1, subtitleTrack = null, sessionId = randomstring.generate(20), offset = 0
	}
		*/
	async startSession({
		type = <'hls' | 'dash' | 'http'>undefined,
		url = <string>undefined,
		resolution,
		preset = <Preset>'ultrafast',
		codec = <'h264' | 'hevc'>'h264',
		audioTrack = -1,
		subtitleTrack = <number>null,
		sessionId = randomstring.generate(20),
		offset = 0,
	}) {
		const session = this.getSession(sessionId);
		if (session) {
			console.log('Killing existing session: ', session.id);
			session.ffmpeg.kill();
		}

		if (fs.existsSync(`${this.transcodeFolder}/${sessionId}`))
			fs.rmSync(`${this.transcodeFolder}/${sessionId}`, { recursive: true, force: true });

		const metadata = session ? session.metadata : await this.getVideoMetadata(url);
		const videoStream = metadata.streams.find((stream) => stream.codec_type == 'video');

		this.sessions[sessionId] = {
			id: sessionId,

			url: url,
			offset: offset,
			audioTrackIdx: audioTrack,
			subtitleTrackIdx: subtitleTrack,
			resolution: resolution ? resolution : `${videoStream.width}x${videoStream.height}`,
			codec,
			preset,

			segmentLengthSeconds: 5,
			metadata,
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
		const { type, segmentLengthSeconds, url, subtitleTrackIdx, audioTrackIdx, offset, metadata, resolution, codec, preset, id } =
			this.sessions[sessionId];
		let throttleTimeout = false;

		const videoStream = metadata.streams.find((stream) => stream.codec_type == 'video');
		const fpsParsed = videoStream.r_frame_rate.split('/');
		// const fps = Math.round((parseInt(fpsParsed[0]) / parseInt(fpsParsed[1])) * 1000) / 1000;
		const fps = parseInt(fpsParsed[0]) / parseInt(fpsParsed[1]);
		//
		const keyFrameInterval = Math.floor(fps * segmentLengthSeconds);

		if (offset) segmentIndex = Math.floor(offset / segmentLengthSeconds);

		this.sessions[sessionId].lastSeekIndex = segmentIndex;

		console.log(segmentIndex);

		const ffmpeg = Ffmpeg(url, { cwd: `${this.transcodeFolder}/${sessionId}` })
			.inputOptions(
				[
					'-loglevel debug',
					'-analyzeduration 20000000',
					'-probesize 20000000',
					...(process.env.TRANSCODE_TYPE === 'nvenc'
						? ['-hwaccel nvdec']
						: process.env.TRANSCODE_TYPE === 'vaapi'
							? ['-hwaccel vaapi']
							: []),
					// '-hwaccel_output_format cuda', //CUDA
					segmentIndex !== 0 && (type == 'hls' || type == 'dash')
						? `-ss ${segmentIndex * segmentLengthSeconds}`
						: offset > 0
							? `-ss ${offset}`
							: undefined,
					'-reconnect 1',
					'-reconnect_at_eof 1',
					'-reconnect_streamed 1',
					'-reconnect_delay_max 4294',
				].filter((arg) => arg),
			)
			.output(type == 'dash' ? `manifest.mpd` : type == 'hls' ? `%d.ts` : '%d.mkv')
			.complexFilter([
				{
					inputs: '0:v:0',
					filter: `${isHardware() ? 'format=nv12,hwupload,' : ''}${buildScaleFilter(resolution)}${isHardware() ? ',hwdownload,format=nv12' : ''}${subtitleTrackIdx ? '[subs];[subs]' + buildSubtitleFilterInlineass() : ''}`,
					outputs: 'video',
				},
				{
					inputs: audioTrackIdx > -1 ? `0:${audioTrackIdx}` : '0:a:0',
					filter: `aresample=async=1:ochl='stereo':rematrix_maxval=0.000000dB:osr=48000`,
					outputs: 'audio',
				},
			])
			.map('video')
			.map('audio')
			.audioCodec('libopus')
			// .audioCodec('libfdk_aac')
			.audioChannels(2)
			.audioBitrate('192k')
			.videoCodec(getEncoder(codec))
			.withVideoBitrate('6000k')
			.withFPS(Math.round(fps))
			.outputOptions(
				[
					// '-profile:a aac_low',
					choosePresetOptions(preset),
					subtitleTrackIdx ? `-map_inlineass 0:${subtitleTrackIdx}` : null,
					'-forced-idr:0 1',
					'-maxrate:v 6000k',
					'-bufsize:v 3000k',
					`-g:v ${keyFrameInterval}`,
					`-keyint_min:v ${keyFrameInterval}`,
					// '-force_key_frames:v expr:gte(t,n_forced*1)',
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
					'-y',
				].filter((arg) => arg),
			);

		if (subtitleTrackIdx)
			ffmpeg
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

		ffmpeg
			.on('start', function (commandLine) {
				console.log('Spawned Ffmpeg with command: ' + commandLine);
				// fs.appendFileSync(`logs/${id}`, 'Spawned Ffmpeg with command: ' + commandLine + '\n');
			})
			.on(
				'progress',
				((progress) => {
					const { currentPositionIndex, lastSeekIndex, segmentLengthSeconds, ffmpeg } = this.sessions[sessionId];

					const currentTimemark = getRealDuration(lastSeekIndex, segmentLengthSeconds, progress.timemark);
					const segmentIndex = Math.ceil(currentTimemark / segmentLengthSeconds);

					this.sessions[sessionId].lastSegmentIndex = segmentIndex;

					const throttle = (segmentIndex - Math.max(lastSeekIndex, currentPositionIndex)) * segmentLengthSeconds >= segmentThrottleSeconds;

					if (throttle && !throttleTimeout) {
						console.log(
							`Session ${sessionId} throttled... ${(segmentIndex - Math.max(lastSeekIndex, currentPositionIndex)) * segmentLengthSeconds >= segmentThrottleSeconds} >= ${segmentThrottleSeconds}`,
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
				// fs.appendFileSync(`logs/${id}`, stderrLine + '\n');
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

		session.lastSeekIndex = segmentIndex;
		session.currentPositionIndex = segmentIndex;
		session.segments = {};

		session.ffmpeg = this.startFfmpeg(sessionId, segmentIndex);
	}

	markSegmentAsRead(sessionId, streamIndex: number = 0, segmentIndex: number) {
		// let index = Object.values(this.sessions[sessionId].segments).findIndex((seg) => seg.index == segmentIndex && seg.stream == streamIndex);
		const index = this.sessions[sessionId].segments[streamIndex].findIndex((stream) => stream.index == segmentIndex);
		this.sessions[sessionId].segments[streamIndex][index] = {
			index: segmentIndex,
			read: true,
		};
	}

	async getSegment(sessionId, streamIndex: number = 0, segmentIndex: number, outputStream) {
		const session = this.getSession(sessionId);

		const segmentPath =
			session.type == 'dash'
				? path.join(session.folderPath, `${streamIndex}-${segmentIndex}.m4s`)
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

		if (
			// fs.existsSync(segmentPath) ||
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
			this.markSegmentAsRead(sessionId, streamIndex, segmentIndex);
			await pipeWait(fs.createReadStream(segmentPath), outputStream);
		} else {
			await this.waitForSegment(sessionId, streamIndex, segmentIndex);
			this.markSegmentAsRead(sessionId, streamIndex, segmentIndex);
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
			if (session.segments[`${streamIndex}`]?.find((stream) => stream.index == segmentIndex)) return resolve();
			this.eventBus.once(`segmentComplete-${sessionId}-${streamIndex}-${segmentIndex}`, () => resolve());
		});
	}
}
