import Ffmpeg from 'fluent-ffmpeg';
import { toXML } from 'to-xml';
import { secondsToIsoPt } from './time';

export function generateManifest(sessionId: string, metadata: Ffmpeg.FfprobeData, segmentLength = 1) {
	const obj = {
		MPD: {
			'@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
			'@xmlns': 'urn:mpeg:dash:schema:mpd:2011',
			'@xmlns:xlink': 'http://www.w3.org/1999/xlink',
			'@xsi:schemaLocation':
				'urn:mpeg:dash:schema:mpd:2011 http://standards.iso.org/ittf/PubliclyAvailableStandards/MPEG-DASH_schema_files/DASH-MPD.xsd',
			'@profiles': 'urn:mpeg:dash:profile:isoff-live:2011',
			'@type': 'static',
			'@mediaPresentationDuration': secondsToIsoPt(metadata.format.duration),
			'@maxSegmentDuration': 'PT10S',
			'@minBufferTime': 'PT10S',
			Period: {
				'@start': 'PT0S',
				'@id': '0',
				'@duration': secondsToIsoPt(metadata.format.duration),
				AdaptationSet: [
					{
						'@segmentAlignment': 'true',
						SegmentTemplate: {
							'@timescale': '1',
							'@duration': segmentLength,
							'@initialization': `${sessionId}/$RepresentationID$/init.m4s`,
							'@media': `${sessionId}/$RepresentationID$/$Number$.m4s`,
							'@startNumber': '1',
						},
						Representation: {
							'@id': '0',
							'@mimeType': 'video/mp4',
							'@codecs': 'avc1.4d002a',
							'@bandwidth': '4214000',
							'@width': '1920',
							'@height': '1080',
						},
					},
					{
						'@segmentAlignment': 'true',
						SegmentTemplate: {
							'@timescale': '1',
							'@duration': segmentLength,
							'@initialization': `${sessionId}/$RepresentationID$/init.m4s`,
							'@media': `${sessionId}/$RepresentationID$/$Number$.m4s`,
							'@startNumber': '1',
						},
						Representation: {
							'@id': '1',
							'@mimeType': 'audio/mp4',
							'@codecs': 'mp4a.40.2',
							'@bandwidth': '256000',
							'@audioSamplingRate': '48000',
							AudioChannelConfiguration: {
								'@schemeIdUri': 'urn:mpeg:dash:23003:3:audio_channel_configuration:2011',
								'@value': '2',
							},
						},
					},
				],
			},
		},
	};

	return toXML(obj);
}

export function dashOutputOptions(sessionId, segmentIndex, segmentLength) {
	return [
		'-f dash',
		`-seg_duration ${segmentLength}`,
		'-dash_segment_type mp4',
		'-init_seg_name init-stream$RepresentationID$.m4s',
		'-media_seg_name chunk-stream$RepresentationID$-$Number%01d$.m4s',
		'-window_size 5',
		'-delete_removed false',
		segmentIndex !== 0 ? `-skip_to_segment ${segmentIndex}` : undefined,
		'-time_delta 0.0625',
		`-manifest_name http://localhost:32402/transcoder/status/${sessionId}/manifest_mpd`,
		'-method POST',
	];
}
