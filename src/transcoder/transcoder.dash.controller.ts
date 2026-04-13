import { Controller, Get, Header, NotFoundException, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SignedUrlGuard } from 'src/middleware/signed-url.guard';
import { TranscoderService } from './transcoder.service';
import fs from 'fs';
import { generateManifest } from 'src/utils/dash';
import path from 'path';
import { waitForFile } from 'src/utils/general';
import { StartTranscodeDto } from './transcoder.dto';

@Controller()
export class TranscoderDASHController {
	constructor(private transcoderService: TranscoderService) {}

	@UseGuards(SignedUrlGuard)
	@Get('/session/start.mpd')
	@Header('content-type', 'text/xml')
	async startDash(@Req() req, @Param() params, @Query() query: StartTranscodeDto) {
		console.debug(`[${query.session}] Started session with URL: ${req.url}`)

		const session = this.transcoderService.getSession(query.session);
		const newSession = session &&
		(query.subtitleTrack ? query.subtitleTrack == session.subtitleTrackIdx : true) &&
		(query.audioTrack ? query.audioTrack == session.audioTrackIdx : true) &&
		(query.bitrate ? query.bitrate == session.bitrate : true) &&
		(query.resolution ? query.resolution == session.resolution : true) &&
		(query.offset ? query.offset == session.offset : true) &&
		(query.url ? query.url == session.url : true)
			? session
			: await this.transcoderService.startSession({
					type: 'dash',
					url: query.url,
					audioTrack: query.audioTrack,
					subtitleTrack: query.subtitleTrack,
					sessionId: query.session,
					codec: query.codec,
					offset: query.offset > 0 ? query.offset : null,
					// startAtZeroIndex: query.startAtZeroIndex,
					resolution: query.resolution,
					bitrate: query.bitrate,
					preset: query.preset,
				});

		// await this.transcoderService.waitForSegments('dash', sessionId, 1, 1) //Wait for first 5 segments starting at seg 1

		await newSession.waitForStart();

		return generateManifest(newSession.id, newSession);
	}

	@Get('/session/:session/:stream/init.m4s')
	async getHeaderDash(@Res() res, @Param() params) {
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();

		const segmentPath = path.join(session.folderPath, `init-${params.stream}.m4s`);

		await waitForFile(segmentPath);

		fs.createReadStream(segmentPath).pipe(res);
	}

	@Get('/session/:session/:stream/:segment.m4s')
	async getSegmentDash(@Res() res, @Param() params) {
		console.debug(`[${params.session}] Getting segment (dash)`, params)
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();
		// console.log(session);
		await session.getSegment(parseInt(params.stream), parseInt(params.segment), res);
		res.end();
	}
}
