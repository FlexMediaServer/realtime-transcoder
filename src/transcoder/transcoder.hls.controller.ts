import { Controller, Get, Header, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { segmentThrottleSeconds, TranscoderService } from "./transcoder.service";;
import fs from 'fs';
import { stringify } from "hls-parser";
import { MediaPlaylist, Segment } from "hls-parser/types";
import { generatePlaylist } from "src/utils/hls";
import path from "path";

@Controller('transcoder')
export class TranscoderHLSController {

	constructor(private transcoderService: TranscoderService) {}
	
	@Get('/start.m3u8')
	@Header('content-type', 'application/vnd.apple.mpegurl')
	async startHls (@Param() params, @Query() query) {
		let { id: sessionId, metadata } = await this.transcoderService.startSession('hls', query.url)
		await this.transcoderService.waitForSegments('hls', sessionId, 0, 5)

		return generatePlaylist(sessionId, metadata);
	}

	@Get('/:session/:segment.ts')
	async getSegment (@Res() res, @Param() params) {
		// console.log(params)
		// await waitForFile(`/tmp/transcode/${params.session}/${params.segment}.ts`);
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();

		const segmentPath = path.join(session.folderPath, `${params.segment}.ts`);

		// if (session.currentPositionIndex + 1 == parseInt(params.segment)) {
		if (fs.existsSync(segmentPath)) {
			await this.transcoderService.waitForSegments('hls', params.session, parseInt(params.segment), 1)
			fs.createReadStream(segmentPath).pipe(res);
		} else {
			await this.transcoderService.seek(params.session, parseInt(params.segment))
			await this.transcoderService.waitForSegments('hls', params.session, parseInt(params.segment), 1)
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