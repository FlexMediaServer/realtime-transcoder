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
		console.log(query.audioTrack, query.subtitleTrack)
		let { id: sessionId, metadata } = await this.transcoderService.startSession('hls', query.url, query.audioTrack ? query.audioTrack : -1, query.subtitleTrack ? query.subtitleTrack : null)
		await this.transcoderService.waitForSegments('hls', sessionId, 0, 5)

		return generatePlaylist(sessionId, metadata);
	}

	@Get('/:session/:segment.ts')
	async getSegment (@Res() res, @Param() params) {
		console.log(params)
		// await waitForFile(`/tmp/transcode/${params.session}/${params.segment}.ts`);
		const session = this.transcoderService.getSession(params.session);
		if (!session) throw new NotFoundException();

		await this.transcoderService.getSegment(session.id, parseInt(params.stream), parseInt(params.segment), res)
		res.end()
	}
}