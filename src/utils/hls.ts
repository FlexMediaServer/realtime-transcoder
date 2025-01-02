import { MasterPlaylist, MediaPlaylist, Segment } from 'hls-parser/types';
import Ffmpeg from 'fluent-ffmpeg';
import { stringify } from 'hls-parser';
import { TranscoderSession, TranscoderSessionStore } from 'src/transcoder/transcoder.types';

export function generatePlaylist(session: TranscoderSession, segmentLength = 1) {
	const playlist = new MediaPlaylist({
		targetDuration: segmentLength,
		playlistType: 'VOD',
		mediaSequenceBase: 0,
		endlist: true,
		start: session.offset > 0 ? { offset: session.offset, precise: false } : undefined,
		segments: Array.from({ length: session.metadata.format.duration / segmentLength }, (_, i) => i)
			.map(
				(index) =>
					new Segment({
						uri: `${index}.ts`,
						duration: segmentLength,
						mediaSequenceNumber: 0,
					}),
			)
			.filter((segment) => segment !== null),
	});

	return stringify(playlist);
}

export function generateMasterPlaylist(session: TranscoderSession) {
	return `#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=8135000,RESOLUTION=1920x1080,FRAME-RATE=23.976000
${session.id}/base/index.m3u8`;
}

export function hlsOutputOptions(sessionId, segmentIndex: number, segmentLength: number) {
	return [
		`-segment_start_number ${segmentIndex}`,
		// '-segment_format mpegts',
		'-segment_format mpegts',
		'-f ssegment',
		'-individual_header_trailer 0',
		`-segment_time ${segmentLength}`,
		'-segment_copyts 1',
		'-segment_time_delta 0.0625',
		'-segment_list_separate_stream_times 1',
		'-segment_list_unfinished 1',
		'-segment_format_options output_ts_offset=10',
		`-segment_list http://localhost:32402/transcoder/status/${sessionId}/manifest_csv`,
		'-segment_list_type csv',
		'-segment_list_size 5',
		'-max_delay 5000000',
		'-flags +global_header',
		'-segment_header_filename header',
	];
}
