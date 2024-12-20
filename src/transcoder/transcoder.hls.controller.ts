import { Controller, Get, Header, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import { segmentThrottleSeconds, TranscoderService } from './transcoder.service';
import fs from 'fs';
import { stringify } from 'hls-parser';
import { MediaPlaylist, Segment } from 'hls-parser/types';
import { generateMasterPlaylist, generatePlaylist } from 'src/utils/hls';
import path from 'path';
import randomstring from 'randomstring';

@Controller('transcoder')
export class TranscoderHLSController {
	constructor(private transcoderService: TranscoderService) {}

	@Get('/start.m3u8')
	@Header('content-type', 'application/vnd.apple.mpegurl')
	async startHls(@Req() req, @Param() params, @Query() query) {
		const session_ = this.transcoderService.getSession(query.session);
		let session =
			session_ &&
			(query.subtitleTrack ? parseInt(query.subtitleTrack) == session_.subtitleTrackIdx : true) &&
			(query.audioTrack ? parseInt(query.audioTrack) == session_.audioTrackIdx : true) &&
			(query.url ? query.url == session_.url : true)
				? session_
				: await this.transcoderService.startSession(
						'hls',
						query.url,
						query.audioTrack ? parseInt(query.audioTrack) : -1,
						query.subtitleTrack ? parseInt(query.subtitleTrack) : null,
						query.session ? query.session : randomstring.generate(20),
						parseInt(query.offset) > 0 ? parseInt(query.offset) : null,
					);

		let segmentIndex = Math.floor(session.offset / session.segmentLengthSeconds);

		// await this.transcoderService.waitForSegment('hls', session.id, 0, segmentIndex);

		return generateMasterPlaylist(session);
	}

	@Get('/:session/base/index.m3u8')
	index(@Param() param) {
		const session = this.transcoderService.getSession(param.session);

		return generatePlaylist(session, session.segmentLengthSeconds);
	}

	@Get('/:session/base/:segment.ts')
	async getSegment(@Res() res, @Param() params) {
		console.log(params);
		// await waitForFile(`/tmp/transcode/${params.session}/${params.segment}.ts`);
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();

		await this.transcoderService.getSegment(session.id, 0, parseInt(params.segment), res);
		res.end();
	}
}
