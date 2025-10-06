import { Controller, Get, Header, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { TranscoderService } from './transcoder.service';
import fs from 'fs';
import { generateManifest } from 'src/utils/dash';
import path from 'path';
import { waitForFile } from 'src/utils/general';
import { StartTranscodeDto } from './transcoder.dto';

@Controller('transcoder')
export class TranscoderDASHController {
	constructor(private transcoderService: TranscoderService) {}

	@Get('/start.mpd')
	@Header('content-type', 'text/xml')
	async startDash(@Param() params, @Query() query: StartTranscodeDto) {
		const session = this.transcoderService.getSession(query.session);
		const {
			id: sessionId,
			metadata,
			segmentLengthSeconds,
		} = session &&
		(query.subtitleTrack ? query.subtitleTrack == session.subtitleTrackIdx : true) &&
		(query.audioTrack ? query.audioTrack == session.audioTrackIdx : true) &&
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
					resolution: query.resolution,
					preset: query.preset,
				});

		// await this.transcoderService.waitForSegments('dash', sessionId, 1, 1) //Wait for first 5 segments starting at seg 1

		return generateManifest(sessionId, metadata, segmentLengthSeconds);
	}

	@Get('/:session/:stream/init.m4s')
	async getHeaderDash(@Res() res, @Param() params) {
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();

		const segmentPath = path.join(session.folderPath, `init-${params.stream}.m4s`);

		await waitForFile(segmentPath);

		fs.createReadStream(segmentPath).pipe(res);
	}

	@Get('/:session/:stream/:segment.m4s')
	async getSegmentDash(@Res() res, @Param() params) {
		console.log(params);
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();
		// console.log(session);
		await this.transcoderService.getSegment(session.id, parseInt(params.stream), parseInt(params.segment), res);
		res.end();
	}
}
