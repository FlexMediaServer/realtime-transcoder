export function httpOutputOptions (segmentLength: number) {
	return [
		// `-segment_start_number ${segmentIndex}`, 
		'-segment_header_filename header',
		// '-segment_list_type csv',
		// '-segment_list manifest.csv',
		'-segment_format matroska', 
		'-f segment', 
		'-individual_header_trailer 0', 
		`-segment_time ${segmentLength}`, 
		'-segment_copyts 1', 
		'-segment_time_delta 0.0625', 
		'-segment_list_separate_stream_times 1',
		'-segment_list_unfinished 1', 
		'-max_delay 5000000',
		'-flags +global_header',
		// '-segment_format_options strip_dovi=1:output_ts_offset=10'
	]
}

// "/usr/lib/plexmediaserver/Plex Transcoder -codec:#0x01 hevc -hwaccel:#0x01 nvdec -hwaccel_fallback_threshold:#0x01 10 -threads:#0x01 1 -hwaccel_output_format:#0x01 cuda -hwaccel_device:#0x01 cuda -codec:#0x02 aac -ss 1880 -analyzeduration 20000000 -probesize 20000000 -i /mnt/plex/Shows/Suits/suits - S1E1 [464cb611757e733868f6c493f4576f4bcccdd873].mp4 -filter_complex [0:#0x01]hwupload[0];[0]scale_cuda=w=720:h=404:format=nv12[1] -map [1] -codec:0 h264_nvenc -b:0 1959k -maxrate:0 2613k -bufsize:0 5226k -forced-idr:0 1 -r:0 23.975999999999999 -force_key_frames:0 expr:gte(t,n_forced*8) -filter_complex [0:#0x02] aresample=async=1:ochl='stereo':rematrix_maxval=0.000000dB:osr=48000[2] -map [2] -metadata:s:1 language=eng -codec:1 libopus -b:1 232k -segment_format matroska -f ssegment -individual_header_trailer 0 -flags +global_header -segment_header_filename header -segment_time 8 -segment_start_number 235 -segment_copyts 1 -segment_time_delta 0.0625 -segment_list http://127.0.0.1:32400/video/:/transcode/session/2012E370-43ED-4020-BF6A-63662A398A87/4410e23d-5b24-4d2c-929e-6e9b577731cb/manifest?X-Plex-Http-Pipeline=infinite -segment_list_type csv -segment_list_size 5 -segment_list_separate_stream_times 1 -segment_list_unfinished 1 -segment_format_options strip_dovi=1:output_ts_offset=10 -max_delay 5000000 -avoid_negative_ts disabled -map_metadata -1 -map_chapters -1 media-%05d.ts -start_at_zero -copyts -init_hw_device cuda=cuda:pci:0000:65:00.0 -filter_hw_device cuda -y -nostats -loglevel quiet -loglevel_plex error -progressurl http://127.0.0.1:32400/video/:/transcode/session/2012E370-43ED-4020-BF6A-63662A398A87/4410e23d-5b24-4d2c-929e-6e9b577731cb/progress"