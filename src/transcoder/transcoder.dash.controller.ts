import { Controller, Get, Header, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { TranscoderService } from './transcoder.service';
import { toXML } from 'to-xml';
import fs from 'fs';
import { generateManifest } from 'src/utils/dash';
import path from 'path';
import randomstring from 'randomstring';
import { waitForFile } from 'src/utils/general';

@Controller('transcoder')
export class TranscoderDASHController {
	constructor(private transcoderService: TranscoderService) {}

	@Get('/start.mpd')
	@Header('content-type', 'text/xml')
	async startDash(@Param() params, @Query() query) {
		const session = this.transcoderService.getSession(query.session);
		let { id: sessionId, metadata } = session
			? session
			: await this.transcoderService.startSession(
					'dash',
					query.url,
					query.audioTrack ? query.audioTrack : -1,
					query.subtitleTrack ? query.subtitleTrack : null,
					query.session ? query.session : randomstring.generate(20),
					parseInt(query.offset) > 0 ? parseInt(query.offset) : null,
				);

		// await this.transcoderService.waitForSegments('dash', sessionId, 1, 1) //Wait for first 5 segments starting at seg 1

		return generateManifest(sessionId, metadata, 1);
	}

	@Get('/:session/:stream/init.m4s')
	async getHeaderDash(@Res() res, @Param() params) {
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();

		const segmentPath = path.join(session.folderPath, `init-stream${params.stream}.m4s`);

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
