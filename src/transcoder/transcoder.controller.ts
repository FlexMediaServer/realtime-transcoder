import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import { TranscoderService } from './transcoder.service';
import { fromXML } from 'from-xml';
import { parse } from 'csv-parse';
@Controller()
export class TranscoderController {
	constructor(private readonly transcoderService: TranscoderService) {}

	@Get('/')
	home () {
		return `
			<h1>Transcoder:</h1>
			<p>Active Sessions: ${Object.entries(this.transcoderService.sessions).length}</p>
		`
	}

	@Get('/transcoder/ping')
	ping() {}

	@Post('/transcoder/status/:id/manifest_mpd')
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
						Number.parseInt(AdaptationSet['@id']),
						Number.parseInt(startNumber),
					);
					startNumber++

					if (segment['@r']) {
						for (let _ in new Array(Number.parseInt(segment['@r']))) {
							this.transcoderService.segmentComplete(
								params.id,
								Number.parseInt(AdaptationSet['@id']),
								Number.parseInt(startNumber),
							);
							startNumber++
						}
					}
				}
			}
		});
	}

	@Post('/transcoder/status/:id/manifest_csv')
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
}
