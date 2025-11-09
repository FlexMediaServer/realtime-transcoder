import { Body, Controller, Delete, Get, Header, NotFoundException, Param, Post, Query, Req, Res } from '@nestjs/common';
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
			<table>
				<caption>Individual Session Details</caption>
				<thead>
					<tr>
						<th>Session ID</th>
						<th>Last Activity</th>
						<th>Segment Length</th>
						<th>Current Segment Index</th>
						<th>Last Segment Index</th>
						<th>Last Seek Index</th>
						<th>Type</th>
						<th>Session URL</th>
						<th>Audio Track</th>
						<th>Subtitle Track</th>
						<th>Codec</th>
						<th>Resolution</th>
						<th>Throttled</th>
						<th>Offset</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					${Object.values(this.transcoderService.sessions).map((session) => {
						return `
						<tr>
							<td>${session.id}</td>
							<td>${new Date(session.lastActivityTs).toLocaleString()}</td>
							<td>${session.segmentLengthSeconds}s</td>
							<td>${session.currentPositionIndex}</td>
							<td>${session.lastSegmentIndex}</td>
							<td>${session.lastSeekIndex}</td>
							<td>${session.type}</td>
							<td><a href="${session.url}">Source</a></td>
							<td>${session.audioTrackIdx}</td>
							<td>${session.subtitleTrackIdx}</td>
							<td>${session.codec}</td>
							<td>${session.resolution}</td>
							<td>${session.throttled}</td>
							<td>${session.offset}</td>
							<td><button onclick="dropSession('${session.id}')">Drop Session</button></td>
						</tr>
						`
					})}
				</tbody>
			</table>
			<style>
				table, th, td {
					border: 1px solid black;
				}
			</style>
			<script>
					setInterval(() => {
  						location.reload();
					}, 5000);

					function dropSession(id) {
						fetch('/transcoder/' + id, {
							method: 'DELETE'
						})
						.then(res => {
							if(!res.ok) throw new Error('Request failed: ' + res.status);
							return res.json();
						})
						.then(data => alert('Deleted:', data))
						.catch(error => console.error(error));
					}
			</script>
		`
	}

	@Get('/transcoder/ping')
	ping() {}

	@Delete('/transcoder/:id')
	dropSession (@Param('id') id) {
		if (this.transcoderService.getSession(id) == undefined) throw new NotFoundException();
		this.transcoderService.stopSession(id);
	}

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
