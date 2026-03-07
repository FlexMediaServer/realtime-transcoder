import { TranscodeSession } from "src/transcoder/transcode.session";

export function httpOutputOptions(session: InstanceType<typeof TranscodeSession>) {
	const options = [
		`-segment_start_number 0`,
		'-segment_header_filename header',
		'-segment_format matroska',
		'-f segment',
		`-segment_time ${session.segmentLengthSeconds}`,
		'-segment_list_separate_stream_times 1',
		'-segment_list_unfinished 1',
		`-segment_list http://localhost:32402/transcoder/status/${session.id}/manifest_csv`,
		'-segment_list_type csv',
		'-segment_list_size 5',
		'-flags +global_header',
		'-segment_format_options live=1',
		'-map_metadata:g -1',
		'-map_metadata:c -1'
	];

	// Add duration metadata if available
	if (session.metadata?.format?.duration) {
		options.splice(4, 0, `-metadata duration=${session.metadata.format.duration}`);
	}

	return options;
}

///usr/lib/plexmediaserver/Plex Transcoder" -codec:0 hevc -hwaccel:0 nvdec -threads:0 1 -hwaccel_output_format:0 cuda -hwaccel_device:0 cuda -codec:1 aac -ss 6 -analyzeduration 20000000 -probesize 20000000 -i "/file.mkv" -start_at_zero -copyts -init_hw_device cuda=cuda:pci:0000:65:00.0 -filter_hw_device cuda -y -nostats -loglevel quiet -loglevel_plex error -progressurl http://127.0.0.1:32400/video/:/transcode/session/sbducdwepvc2gegz3xlcdw81/9e29640a-eeb9-4891-af7c-3801a98140d4/progress -filter_complex "[0:0]hwupload[0];[0]scale_cuda=w=720:h=404:format=p010[1]" -map "[1]" -metadata:s:0 language=jpn -codec:0 hevc_nvenc -b:0 1245k -maxrate:0 1245k -bufsize:0 2490k -forced-idr:0 1 -r:0 23.975999999999999 -filter_complex "[0:1] aresample=async=1:ochl='stereo':rematrix_maxval=60.000000dB:osr=48000[2]" -map "[2]" -metadata:s:1 language=jpn -codec:1 libopus -b:1 174k -map 0:3 -metadata:s:2 language=eng -codec:2 copy -strict_ts:2 0 -map "0:t?" -codec:t copy -f segment -segment_format matroska -metadata duration=1435.086 -segment_format_options live=1 -segment_time 1 -segment_header_filename header -segment_start_number 0 -segment_list "http://127.0.0.1:32400/video/:/transcode/session/sbducdwepvc2gegz3xlcdw81/9e29640a-eeb9-4891-af7c-3801a98140d4/manifest?X-Plex-Http-Pipeline=infinite" -segment_list_type csv -segment_list_unfinished 1 -segment_list_size 5 -segment_list_separate_stream_times 1 -avoid_negative_ts disabled -map_metadata:g -1 -map_metadata:c -1 -map_chapters -1 "chunk-%05d"