import { MediaPlaylist, Segment } from "hls-parser/types";
import Ffmpeg from 'fluent-ffmpeg';
import { stringify } from "hls-parser";
import { TranscoderSession, TranscoderSessionStore } from "src/transcoder/transcoder.service";

export function generatePlaylist (session: TranscoderSession, segmentLength = 1) {
	const playlist = new MediaPlaylist({
		targetDuration: segmentLength,
		playlistType: 'VOD',
		mediaSequenceBase: 0,
		endlist: true,
		start: session.offset > 0 ? { offset: session.offset, precise: false } : undefined,
		segments: Array.from({ length: session.metadata.format.duration/segmentLength }, (_, i) => i).map(
			(index) => new Segment({
				uri: `${session.id}/${index}.ts`,
				duration: segmentLength,
				mediaSequenceNumber: 0
			})
		).filter(segment => segment !== null)
	});

	return stringify(playlist)
}

export function hlsOutputOptions (segmentIndex: number, segmentLength: number) {
	return [
		`-segment_start_number ${segmentIndex}`, 
		'-segment_format mpegts', 
		'-f ssegment', 
		'-individual_header_trailer 0', 
		`-segment_time ${segmentLength}`, 
		'-segment_copyts 1', 
		'-segment_time_delta 0.0625', 
		'-segment_list_separate_stream_times 1',
		'-segment_list_unfinished 1', 
		'-max_delay 5000000'
	]
}