import Ffmpeg from 'fluent-ffmpeg';
import { Preset } from './transcoder.dto';

export type TranscoderSession = {
	/** Randomly generated 20 digit string to identify the transcoder session */
	id: string;
	lastActivityTs: number;
	/** Segment length may very depending on the client that is being used. Example: most clients allow 1 second segments for faster loading, but some clients prefer larger segments such as 3 seconds */
	segmentLengthSeconds: number;
	/** Represents the last segment that the transcoder has processed */
	lastSegmentIndex: number;
	/** Represents the last segment that was seeked to. Used to keep track of segment  */
	lastSeekIndex: number;
	currentPositionIndex: number;
	/** The file url the file that is being transcoded */
	url: string;
	/** Track Idx values */
	audioTrackIdx: number;
	subtitleTrackIdx: number;
	resolution: string;
	codec: 'h264' | 'hevc';
	preset: Preset;

	lastRequestedSegment: {
		[stream: string]: number;
	};

	segments: {
		[streamId: string]: [
			{
				index: number;
				read: boolean;
			},
		];
	};
	/**
	 * The path to the subtitle file that is used in transcoding
	 *
	 * @Optional
	 * */
	folderPath: string;
	throttled: boolean;
	metadata?: Ffmpeg.FfprobeData;
	type: 'hls' | 'dash' | 'http';

	offset: number;

	ffmpeg: any;
};

export type TranscoderSessionStore = {
	/** id is the session ID from the stored sessions */
	[id: string]: TranscoderSession;
};
