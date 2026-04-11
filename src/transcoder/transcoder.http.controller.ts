import { Controller, Get, Param, Query, Res, Headers } from '@nestjs/common';
import { PassThrough } from 'stream';
import { TranscoderService } from './transcoder.service';
import fs from 'fs';
import { pipeWait } from 'src/utils/general';
import randomstring from 'randomstring';
import { StartTranscodeDto } from './transcoder.dto';

@Controller()
export class TranscoderHTTPController {
	constructor(private transcoderService: TranscoderService) {}

	@Get('/session/start')
	async startHTTP(@Param() params, @Query() query: StartTranscodeDto, @Res() res, @Headers() headers) {
		console.log(headers['range'], query['offset']);
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
					type: 'http',
					url: query.url,
					audioTrack: query.audioTrack,
					subtitleTrack: query.subtitleTrack,
					sessionId: query.session,
					codec: query.codec,
					offset: query.offset > 0 ? query.offset : null,
					resolution: query.resolution,
					bitrate: query.bitrate,
					segmentThrottleSeconds: 240,
					preset: query.preset,
				});

		console.log('Session: ', session.id);
		await session.waitForStart();
		await session.waitForSegment(0, 1);
		console.log('Sending header');
		await pipeWait(fs.createReadStream(`${session.folderPath}/header`), res);

		let segment = session.startIndex;
		let loopSegments = true;

		res.on('close', () => {
			session.stop()
			loopSegments = false;
		});

		while (loopSegments) {
			await session.getSegment(0, segment, res);
			segment++;
		}
	}
}
