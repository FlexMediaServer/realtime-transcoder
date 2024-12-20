import { Controller, Get, Param, Query, Res, Headers } from '@nestjs/common';
import { PassThrough } from 'stream';
import { TranscoderService } from './transcoder.service';
import fs from 'fs';
import { pipeWait } from 'src/utils/general';
import randomstring from 'randomstring';

@Controller('transcoder')
export class TranscoderHTTPController {
	constructor(private transcoderService: TranscoderService) {}

	@Get('/start')
	async startHTTP(@Param() params, @Query() query, @Res() res, @Headers() headers) {
		console.log(headers['range'], query['offset']);
		let session = await this.transcoderService.startSession(
			'http',
			query.url,
			query.audioTrack ? parseInt(query.audioTrack) : -1,
			query.subtitleTrack ? parseInt(query.subtitleTrack) : null,
			query.session ? query.session : randomstring.generate(20),
			query.offset > 0 ? query.offset : null,
		);

		console.log('Session: ', session.id);
		await this.transcoderService.waitForSegment(session.id, 0, 1);
		console.log('Sending header');
		await pipeWait(fs.createReadStream(`${session.folderPath}/header`), res);

		let segment = session.currentPositionIndex + 1;
		let loopSegments = true;

		while (loopSegments) {
			await this.transcoderService.getSegment(session.id, 0, segment, res);
			segment++;
		}

		res.on('close', () => {
			loopSegments = false;
		});
	}
}
