import { Controller, Get, Param, Query, Res, Headers } from "@nestjs/common";
import { PassThrough } from "stream";
import { TranscoderService } from "./transcoder.service";
import fs from "fs";
import { pipeWait } from "src/utils/general";

@Controller('transcoder')
export class TranscoderHTTPController {

	constructor (private transcoderService: TranscoderService) {}

	@Get('/start')
	async startHTTP (@Param() params, @Query() query, @Res() res, @Headers() headers) {
		console.log(headers['range'], query['offset'])
		let { id: sessionId, currentPositionIndex } = await this.transcoderService.startSession('http', query.url, query.audioTrack ? query.audioTrack : -1, query.subtitleTrack ? query.subtitleTrack : null)

		
		console.log('Session: ', sessionId)
		await this.transcoderService.waitForSegments('hls', sessionId, 0, 1)
		console.log('Sending header')
		await pipeWait(fs.createReadStream(`/dev/shm/${sessionId}/header`), res)


		let segment = currentPositionIndex;
		let loopSegments = true;

		while (loopSegments) {
			await this.transcoderService.getSegment(sessionId, 0, segment, res)
			segment++
		}

		res.on('close', () => {
			loopSegments = false
		})
	}
}