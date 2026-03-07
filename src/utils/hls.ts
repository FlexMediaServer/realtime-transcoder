import { MasterPlaylist, MediaPlaylist, Segment } from 'hls-parser/types';
import Ffmpeg from 'fluent-ffmpeg';
import { stringify } from 'hls-parser';
import { TranscoderSessionStore } from 'src/transcoder/transcoder.types';
import { TranscodeSession } from 'src/transcoder/transcode.session';

export function generatePlaylist(session: TranscodeSession, segmentLength = 1) {

	let segmentCount = Math.ceil((session.metadata.format.duration / segmentLength));
	
	const playlist = new MediaPlaylist({
		targetDuration: segmentLength,
		playlistType: 'VOD',
		mediaSequenceBase: 0,
		endlist: true,
		version: 6,
		start: session.offset > 0 /* && !session.startAtZeroIndex */ ? { offset: session.offset, precise: false } : undefined,
		segments: Array.from({ length: segmentCount }, (_, i) => i)
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

export function generateMasterPlaylist(session: TranscodeSession) {
	const masterPlaylist = new MasterPlaylist({
		version: 6,
		variants: [
			{
				uri: `${session.id}/base/index.m3u8`,
				bandwidth: 8135000,
				resolution: {
					width: 1920,
					height: 1080
				},
				frameRate: 24,
				codecs: 'avc1.4D401F,mp4a.40.2',
				score: 0,
				// allowedCpc: [],
				videoRange: 'SDR',
				stableVariantId: '',
				programId: undefined,
				audio: [],
				video: [],
				subtitles: [],
				closedCaptions: [],
				currentRenditions: {
					audio: 0,
					video: 0,
					subtitles: 0,
					closedCaptions: 0
				}
			} as any
		]
	})

	return stringify(masterPlaylist) + '\n'
}

export function hlsOutputOptions(session: InstanceType<typeof TranscodeSession>) {
	return [
		`-segment_start_number ${session.startIndex}`,
		// '-segment_format mpegts',
		'-segment_format mpegts',
		'-f ssegment',
		'-individual_header_trailer 0',
		`-segment_time ${session.segmentLengthSeconds}`,
		// '-segment_copyts 1',
		'-segment_time_delta 0.0625',
		// '-segment_list_separate_stream_times 1',
		// '-segment_list_unfinished 1',
		'-segment_format_options output_ts_offset=10',
		`-segment_list http://localhost:32402/transcoder/status/${session.id}/manifest_csv`,
		'-segment_list_type csv',
		'-segment_list_size 5',
		'-max_delay 5000000',
		'-flags +global_header',
		'-segment_header_filename header',
		'-map_metadata -1',
	];
}
