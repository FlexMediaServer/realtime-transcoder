import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import { TranscoderService } from './transcoder.service';
import { fromXML } from 'from-xml';
import { parse } from 'csv-parse';
@Controller('transcoder')
export class TranscoderController {
	constructor(private transcoderService: TranscoderService) {}

	// @Post('progress')
	// progress (@Body() body, @Req() req) {
	// 	req.on('data', (data) => {
	// 		console.log(data)
	// 	});
	// }

	@Get('/ping')
	ping() {}

	@Post('/status/:id/manifest_mpd')
	dashManifest(@Req() req, @Param() params) {
		req.setEncoding('utf8');
		req.on('data', (data) => {
			const manifest = fromXML(data);
			if (manifest.MPD.Period.AdaptationSet && !Array.isArray(manifest.MPD.Period.AdaptationSet))
				manifest.MPD.Period.AdaptationSet = [manifest.MPD.Period.AdaptationSet];

			for (const AdaptationSet of manifest.MPD.Period.AdaptationSet) {
				let startNumber = AdaptationSet.Representation.SegmentTemplate['@startNumber'];

				const S = AdaptationSet.Representation.SegmentTemplate?.SegmentTimeline?.['S'];

				const segments = Array.isArray(S) ? S : [S];

				for (let segment of segments) {
					this.transcoderService.segmentComplete(
						params.id,
						parseInt(AdaptationSet['@id']),
						parseInt(startNumber),
					);
					startNumber++

					if (segment['@r']) {
						for (let i in [...Array(parseInt(segment['@r']))]) {
							this.transcoderService.segmentComplete(
								params.id,
								parseInt(AdaptationSet['@id']),
								parseInt(startNumber),
							);
							startNumber++
						}
					}
				}
			}
		});
	}

	@Post('/status/:id/manifest_csv')
	segmentList(@Req() req, @Param() params) {
		req.setEncoding('utf8');
		req.on('data', (data) => {
			const rows = data
				.split('\n')
				.filter((row) => !row.startsWith('#') && row !== '')
				.reverse();
			if (rows.length <= 0) return;
			const segment = rows[0].split(',')[0].split('.')[0];
			this.transcoderService.segmentComplete(params.id, 0, Math.round(parseInt(segment)));
		});
	}

	// @Post('/:id/progress')
	// progress(@Req() req, @Res() res: Response) {
	// 	req.on('data', (data) => {
	// 		console.log(data.toString());
	// 	});
	// }

	// @Post('/:id/progress_url')
	// progressUrl(@Req() req, @Res() res: Response) {
	// 	req.on('data', (data) => {
	// 		console.log(data.toString());
	// 	});
	// }
}
