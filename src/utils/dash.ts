import Ffmpeg from 'fluent-ffmpeg';
import { toXML } from 'to-xml';
import { secondsToIsoPt } from './time';
import { TranscoderSession } from 'src/transcoder/transcoder.types';
import { TranscodeSession } from 'src/transcoder/transcode.session';

export function generateManifest(sessionId: string, session: TranscodeSession) {

	let duration = Math.floor((session.metadata.format.duration / session.segmentLengthSeconds) - session.offset ? session.offset : 0) * session.segmentLengthSeconds;;

	const obj = {
		MPD: {
			'@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
			'@xmlns': 'urn:mpeg:dash:schema:mpd:2011',
			'@xmlns:xlink': 'http://www.w3.org/1999/xlink',
			'@xsi:schemaLocation':
				'urn:mpeg:dash:schema:mpd:2011 http://standards.iso.org/ittf/PubliclyAvailableStandards/MPEG-DASH_schema_files/DASH-MPD.xsd',
			'@profiles': 'urn:mpeg:dash:profile:isoff-live:2011',
			'@type': 'static',
			'@mediaPresentationDuration': secondsToIsoPt(duration),
			// '@maxSegmentDuration': 'PT10S',
			// '@minBufferTime': 'PT10S',
			Period: {
				// '@start': secondsToIsoPt(session.offset),
				'@id': '0',
				'@duration': secondsToIsoPt(duration),
				AdaptationSet: [
					{
						'@segmentAlignment': 'true',
						SegmentTemplate: {
							'@timescale': '1',
							'@duration': session.segmentLengthSeconds,
							'@initialization': `${sessionId}/$RepresentationID$/init.m4s`,
							'@media': `${sessionId}/$RepresentationID$/$Number$.m4s`,
							'@startNumber': session.startIndex ? (session.startIndex).toString() : '1',
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
							'@duration': session.segmentLengthSeconds,
							'@initialization': `${sessionId}/$RepresentationID$/init.m4s`,
							'@media': `${sessionId}/$RepresentationID$/$Number$.m4s`,
							'@startNumber': session.startIndex ? (session.startIndex).toString() : '1',
						},
						Representation: {
							'@id': '1',
							'@mimeType': 'audio/mp4',
							'@codecs': 'mp4a.40.29',
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

export function dashOutputOptions(session: InstanceType<typeof TranscodeSession>) {
	return [
		'-f dash',
		`-seg_duration ${session.segmentLengthSeconds}`,
		'-dash_segment_type mp4',
		'-init_seg_name init-$RepresentationID$.m4s',
		'-media_seg_name $RepresentationID$-$Number%01d$.m4s',
		'-window_size 5',
		'-delete_removed false',

		// '-frag_type every_frame',
		// '-write_prft 0',
		// '-flush_packets 1',

		//Prevents unnecessary addition of -skip-to-segment. (Note DASH segments start at 1)
		session.startIndex > 1 ? `-skip_to_segment ${session.startIndex}` : undefined,
		// '-time_delta 0.0625',
		`-manifest_name http://localhost:32402/transcoder/status/${session.id}/manifest_mpd`,
		'-method POST',
	];
	// return [
	// 	`-segment_start_number ${segmentIndex}`,
	// 	// '-segment_format mpegts',
	// 	'-segment_format m4s',
	// 	'-f ssegment',
	// 	'-individual_header_trailer 0',
	// 	`-segment_time ${segmentLength}`,
	// 	// '-segment_copyts 1',
	// 	'-segment_time_delta 0.0625',
	// 	// '-segment_list_separate_stream_times 1',
	// 	// '-segment_list_unfinished 1',
	// 	segmentIndex > 0
	// 		? '-segment_format_options movflags=+dash+delay_moov+global_sidx+skip_trailer+frag_discont'
	// 		: '-segment_format_options movflags=+dash+delay_moov+global_sidx+skip_trailer',
	// 	`-segment_list http://localhost:32402/transcoder/status/${sessionId}/manifest_csv`,
	// 	'-segment_list_type csv',
	// 	'-segment_list_size 5',
	// 	'-max_delay 5000000',
	// 	'-flags +global_header',
	// 	'-segment_header_filename header',
	// ];
}
