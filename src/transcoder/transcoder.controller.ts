import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import { TranscoderService } from './transcoder.service';

@Controller('transcoder')
export class TranscoderController {

	constructor(private transcoderService: TranscoderService) {}

	// @Post('progress')
	// progress (@Body() body, @Req() req) {
	// 	req.on('data', (data) => {
	// 		console.log(data)
	// 	});
	// }

}
