import { Body, Controller, Delete, Get, Header, NotFoundException, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { TranscoderService } from './transcoder.service';
import { fromXML } from 'from-xml';
import { parse } from 'csv-parse';
import { BasicAuthGuard } from 'src/middleware/basic-auth.guard';
import Keyv from 'keyv';

@Controller()
export class TranscoderController {
	constructor(private readonly transcoderService: TranscoderService) {}

	@UseGuards(BasicAuthGuard)
	@Get('/')
	home () {
		return `
		    <div class="header">
				<img width="72px" src="https://avatars.githubusercontent.com/u/191876783?s=400&u=31a28945648f2ee2323dcb72b7d2384e9bcdb115&v=4" />
				<h1>Plextra Transcoder</h1>
			</div>
			<table>
				<caption><strong>Individual Session Details (${Object.entries(this.transcoderService.sessions).length} active)</strong></caption>
				<thead>
					<tr>
						<th>Session ID</th>
						<th>Last Activity</th>
						<th>Segment Length</th>
						<th>Current Segment Index</th>
						<th>Last Transcoded Segment</th>
						<th>Last Seek Index</th>
						<th>Type</th>
						<th>Session URL</th>
						<th>Audio Track</th>
						<th>Subtitle Track</th>
						<th>Codec</th>
						<th>Resolution</th>
						<th>Bitrate</th>
						<th>Paused</th>
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
							<td>${session.lastTranscodedSegment}</td>
							<td>${session.lastSeekIndex}</td>
							<td>${session.type}</td>
							<td><a href="${session.url}">Source</a></td>
							<td>${session.audioTrackIdx}</td>
							<td>${session.subtitleTrackIdx}</td>
							<td>${session.codec}</td>
							<td>${session.resolution}</td>
							<td>${session.bitrate}k</td>
							<td>${session.paused}</td>
							<td>${session.offset}</td>
							<td>
								<button onclick="restartSession('${session.id}')">Restart Session</button>
								<button onclick="dropSession('${session.id}')">Drop Session</button>
							</td>
						</tr>
						`
					})}
				</tbody>
			</table>
			<style>

				caption {
				    border-top: 1px solid white;
					background-color: #282a2d;
					padding: 20px;
				}

				.header {
				    display: flex;
					flex-direction: row;
					gap: 20px;
					background-color: #282a2d;
					color: white;
				}

				html, body {
					background-color: #282a2d;
					margin: 0;
					padding: 0;
				}

				table {
				    background-color: #282a2d;
					color: white;
					width: 100%;
				}

				table, th, td {
					border-collapse: collapse;
					border: 1px solid white;
				}

				th, td {
					padding-left: 10px;
					padding-right: 10px;
				}

				tr, td, th {
					max-height: 50px;
				}
			</style>
			<script>
					const pageBaseUrl = window.location.origin;

					setInterval(() => {
  						location.reload();
					}, 10000);

					function dropSession(id) {
						fetch(pageBaseUrl + '/session/' + id, {
							method: 'DELETE'
						})
						.then(res => {
							if(!res.ok) throw new Error('Request failed: ' + res.status);
							location.reload();
							return res.json();
						})
						.then(data => alert('Deleted:', data))
						.catch(error => console.error(error));
					}
					
					function restartSession(id) {
						fetch(pageBaseUrl + '/session/' + id, {
							method: 'PUT'
						})
						.then(res => {
							if(!res.ok) throw new Error('Request failed: ' + res.status);
							location.reload();
							return res.json();
						})
						.then(data => alert('Restarted:', data))
						.catch(error => console.error(error));
					}
			</script>
		`
	}

	@Get('/ping')
	ping() {}

	@Get('/metadata')
	async metadata(@Query() query: { url: string }) {
		let metadata = await this.transcoderService.getMetadata(query.url);

		return { metadata };
	}

	@UseGuards(BasicAuthGuard)
	@Delete('/session/:id')
	async dropSession (@Param('id') id) {
		if (this.transcoderService.getSession(id) == undefined) throw new NotFoundException();
		await this.transcoderService.getSession(id)?.stop()
		delete this.transcoderService.sessions[id];
	}

	@UseGuards(BasicAuthGuard)
	@Put('/session/:id')
	async restartSession (@Param('id') id) {
		if (this.transcoderService.getSession(id) == undefined) throw new NotFoundException();
		await this.transcoderService.getSession(id)?.restart()
	}

	@Post('/session/status/:id/manifest_mpd')
	dashManifest(@Req() req, @Param() params) {

		const session = this.transcoderService.getSession(params.id);

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
					session.segmentComplete(
						Number.parseInt(AdaptationSet['@id']),
						Number.parseInt(startNumber),
					);
					startNumber++

					if (segment['@r']) {
						for (let _ in [...Array(Number.parseInt(segment['@r']))]) {
							session.segmentComplete(
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

	@Post('/session/status/:id/manifest_csv')
	segmentList(@Req() req, @Param() params) {
		const session = this.transcoderService.getSession(params.id);
		req.setEncoding('utf8');
		req.on('data', (data) => {
			const rows = data
				.split('\n')
				.filter((row) => !row.startsWith('#') && row !== '')
				.reverse();
			if (rows.length <= 0) return;
			for (let row of rows) {
				const segment = row.split(',')[0].split('.')[0];
				session.segmentComplete(0, parseInt(segment));
			}
		});
	}
}
