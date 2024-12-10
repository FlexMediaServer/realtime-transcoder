import { Controller, Get, Header, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { TranscoderService } from "./transcoder.service";
import { toXML } from "to-xml";
import fs from 'fs';
import { generateManifest } from "src/utils/dash";
import path from "path";

@Controller('transcoder')
export class TranscoderDASHController {

	constructor(private transcoderService: TranscoderService) {}
	
	@Get('/start.mpd')
	@Header('content-type', 'text/xml')
	async startDash (@Param() params, @Query() query) {
		let { id: sessionId, metadata } = await this.transcoderService.startSession('dash', query.url);
		await this.transcoderService.waitForSegments('dash', sessionId, 1, 5) //Wait for first 5 segments starting at seg 1

		return generateManifest(sessionId, metadata, 1);
	}

	@Get('/:session/:stream/init.m4s')
	async getHeaderDash (@Res() res, @Param() params) {
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();
		
		const segmentPath = path.join(session.folderPath, `init-stream${params.stream}.m4s`);

		fs.createReadStream(segmentPath).pipe(res);
	}

	@Get('/:session/:stream/:segment.m4s')
	async getSegmentDash (@Res() res, @Param() params) {
		console.log(params)
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();
		
		const segmentPath = path.join(session.folderPath, `chunk-stream${params.stream}-${params.segment}.m4s`);
		
		// if (session.currentPositionIndex + 1 == parseInt(params.segment)) {
		if (fs.existsSync(segmentPath)) {
			await this.transcoderService.waitForSegments('dash', params.session, parseInt(params.segment), 1)
			fs.createReadStream(segmentPath).pipe(res);
		} else {
			if (params.stream == 0) await this.transcoderService.seek(params.session, parseInt(params.segment))
			await this.transcoderService.waitForSegments('dash', params.session, parseInt(params.segment), 1);
			fs.createReadStream(segmentPath).pipe(res);
		}

		if (session.throttled) {
			console.log(session.lastSegementIndex - parseInt(params.segment))
			if (session.lastSegementIndex - parseInt(params.segment) <= 10) {
				session.ffmpeg.kill('SIGCONT')
				session.throttled = false;
			}
		}

		session.currentPositionIndex = parseInt(params.segment);
	}
}