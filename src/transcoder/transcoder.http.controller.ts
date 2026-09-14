import { Controller, Get, Param, Query, Res, Headers, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { TranscoderService } from './transcoder.service';
import fs from 'fs';
import { pipeWait } from 'src/utils/general';
import randomstring from 'randomstring';
import { StartTranscodeDto } from './transcoder.dto';
import { UrlSignatureGuard } from 'src/middleware/url-signature.guard';

@Controller()
export class TranscoderHTTPController {
	constructor(private transcoderService: TranscoderService) { }

	@Get('/session/start')
	@UseGuards(UrlSignatureGuard)
	async startHTTP(@Param() params, @Query() query: StartTranscodeDto, @Res() res, @Req() req, @Headers() headers) {
		const session_ = this.transcoderService.getSession(query.session);
		if (query.url === undefined && session_ === undefined) throw new BadRequestException('`url` must be defined to start a transcode session');

		console.debug(`[${query.session}] Started session with URL: ${req.url}`)

		const session =
			session_ &&
				(query.directStreamAudio !== undefined ? query.directStreamAudio == session_.directStreamAudio : true) &&
				(query.directStreamVideo !== undefined ? query.directStreamVideo == session_.directStreamVideo : true) &&
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
					directStreamAudio: query.directStreamAudio,
					directStreamVideo: query.directStreamVideo,
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

		console.debug('Session: ', session.id);
		await session.waitForStart();
		await session.waitForSegment(0, 1);
		console.debug('Sending header');
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
