import { Controller, Get, Header, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { segmentThrottleSeconds, TranscoderService } from "./transcoder.service";;
import fs from 'fs';
import { stringify } from "hls-parser";
import { MediaPlaylist, Segment } from "hls-parser/types";
import { generatePlaylist } from "src/utils/hls";
import path from "path";
import randomstring from 'randomstring';

@Controller('transcoder')
export class TranscoderHLSController {

	constructor(private transcoderService: TranscoderService) {}
	
	@Get('/start.m3u8')
	@Header('content-type', 'application/vnd.apple.mpegurl')
	async startHls (@Param() params, @Query() query) {
		
		const session_ = this.transcoderService.getSession(query.session);
		let session = session_ ? session_ : await this.transcoderService.startSession(
			'hls', 
			query.url, 
			query.audioTrack ? query.audioTrack : -1, 
			query.subtitleTrack ? query.subtitleTrack : null,
			query.session ? query.session : randomstring.generate(20),
			parseInt(query.offset) > 0 ? parseInt(query.offset) : null
		)

		let segmentIndex = Math.floor(session.offset/session.segmentLengthSeconds)

		await this.transcoderService.waitForSegments('hls', session.id, segmentIndex, 5)

		return generatePlaylist(session);
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