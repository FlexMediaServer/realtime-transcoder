import { Controller, Get, Header, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import { segmentThrottleSeconds, TranscoderService } from './transcoder.service';
import fs from 'fs';
import { stringify } from 'hls-parser';
import { MediaPlaylist, Segment } from 'hls-parser/types';
import { generateMasterPlaylist, generatePlaylist } from 'src/utils/hls';
import path from 'path';
import randomstring from 'randomstring';
import { StartTranscodeDto } from './transcoder.dto';

@Controller()
export class TranscoderHLSController {
	constructor(private transcoderService: TranscoderService) {}

	@Get('/session/start.m3u8')
	@Header('content-type', 'application/vnd.apple.mpegurl')
	async startHls(@Req() req, @Param() params, @Query() query: StartTranscodeDto) {
		console.debug(`[${query.session}] Started session with URL: ${req.url}`)

		const session_ = this.transcoderService.getSession(query.session);
		const session =
			session_ &&
			(query.subtitleTrack ? query.subtitleTrack == session_.subtitleTrackIdx : true) &&
			(query.audioTrack ? query.audioTrack == session_.audioTrackIdx : true) &&
			(query.bitrate ? query.bitrate == session_.bitrate : true) &&
			(query.resolution ? query.resolution == session_.resolution : true) &&
			(query.offset ? query.offset == session_.offset : true) &&
			(query.url ? query.url == session_.url : true)
				? session_
				: await this.transcoderService.startSession({
						type: 'hls',
						url: query.url,
						audioTrack: query.audioTrack,
						subtitleTrack: query.subtitleTrack,
						codec: query.codec,
						sessionId: query.session,
						offset: query.offset > 0 ? query.offset : null,
						// startAtZeroIndex: query.startAtZeroIndex,
						resolution: query.resolution,
						bitrate: query.bitrate,
						preset: query.preset,
					});

		await session.waitForStart();

		return generateMasterPlaylist(session);
	}

	@Get('/session/:session/base/index.m3u8')
	@Header('content-type', 'application/vnd.apple.mpegurl')
	async index(@Param() param) {
		const session = this.transcoderService.getSession(param.session);

		await session.getFileMetadata();

		return generatePlaylist(session, session.segmentLengthSeconds);
	}

	@Get('/session/:session/base/:segment.ts')
	async getSegment(@Res() res, @Param() params) {
		console.debug(`[${params.session}] Getting segment (hls)`, params)
		// await waitForFile(`/tmp/transcode/${params.session}/${params.segment}.ts`);
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();

		res.setHeader('content-type', 'video/mp2t');

		await session.getSegment(0, parseInt(params.segment), res);
		res.end();
	}
}
