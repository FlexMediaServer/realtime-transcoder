import Ffmpeg, { FilterSpecification } from 'fluent-ffmpeg';
import { vaapiPresetOptions } from './hwaccel/vaapi';
import { Preset } from 'src/transcoder/transcoder.dto';
import { cudaPresetOptions } from './hwaccel/cuda';
import { getStream } from './general';
import { TranscodeSession } from 'src/transcoder/transcode.session';

export function buildComplexFilters (session: TranscodeSession): FilterSpecification[] {

	const imageSubtitleFormat = session.subtitleTrackIdx ? isImageSubtitleFormat(getStream(session.metadata, session.subtitleTrackIdx)) : false;

	return [

		{
			inputs: `0:v:0`,
			filter: [
				isHDR(session.metadata) ? 'tonemap=hable,format=nv12' : 'format=nv12',
				session.subtitleTrackIdx && !imageSubtitleFormat ? buildSubtitleFilterInlineass() : undefined,
			].filter(filter => filter).join(','),
			outputs: 'video_1',
		},

		imageSubtitleFormat && session.subtitleTrackIdx ? {
			inputs: ['video_1', `0:${session.subtitleTrackIdx}`],
			filter: 'overlay',
			outputs: 'video_2',
		} : {
			inputs: ['video_1'],
			filter: 'null',
			outputs: 'video_2'
		},

		//If is hardware, upload to GPU
		isHardware() ? {
			inputs: ['video_2'],
			filter: [
				'hwupload',
			].filter(filter => filter).join(','),
			outputs: 'video_3'
		} : {
			inputs: ['video_2'],
			filter: 'null',
			outputs: 'video_3'
		},

		{
			inputs: `video_3`,
			filter: [
				buildScaleFilter(session.resolution)
			].filter(filter => filter).join(','),
			outputs: 'video',
		},

		{
			inputs: session.audioTrackIdx > -1 ? `0:${session.audioTrackIdx}` : '0:a:0',
			filter: `aresample=async=1:ochl='stereo':rematrix_maxval=0.000000dB:osr=48000${session.offset == 0 ? ':first_pts=0' : ''}`,
			outputs: 'audio',
		},
	].filter(filter => filter)
	
}

export function buildSubtitleFilterInlineass(): string {
	return `inlineass=font_scale=1.250000:font_path=/usr/src/app/assets/NotoSans-Medium.otf:fontconfig_file=/usr/src/app/assets/fonts.conf:language=en`;
}

export function buildScaleFilter(resolution: string): string {
	const type = process.env.TRANSCODE_TYPE || 'software';

	const [w, h] = resolution.split('x');

	switch (type) {
		case 'nvenc':
			return `scale_cuda=w=${w}:h=${h}`;
		case 'vaapi':
			return `scale_vaapi=w=${w}:h=${h}`;
		case 'software':
		default:
			return `scale=${w}:${h}`;
	}
}

export function getEncoder(codec: 'h264' | 'hevc') {
	const type = process.env.TRANSCODE_TYPE || 'software';

	switch (type) {
		case 'vaapi':
			return codec == 'hevc' ? 'hevc_vaapi' : 'h264_vaapi';
		case 'nvenc':
			return codec == 'hevc' ? 'hevc_nvenc' : 'h264_nvenc';
		case 'software':
		default:
			return codec == 'hevc' ? 'libx265' : 'libx264';
	}
}

export function isHardware() {
	const type = process.env.TRANSCODE_TYPE || 'software';

	return type === 'vaapi' || type === 'nvenc';
}


export function isHDR(metadata: Ffmpeg.FfprobeData) {
	return metadata.streams?.[0]?.color_primaries == 'bt2020';
}


export function buildTonemapFilter() {
	const type = process.env.TRANSCODE_TYPE || 'software';

	switch (type) {
		case 'nvenc':
			return `tonemap=hable,zscale=primaries=bt709:transfer=bt709:matrix=bt709`
		case 'software':
		default:
			return `tonemap=hable,zscale=primaries=bt709:transfer=bt709:matrix=bt709`
	}
}

export function isImageSubtitleFormat(stream: Ffmpeg.FfprobeStream) {
	return ['dvd_subtitle', 'hdmv_pgs_subtitle', 'dvb_subtitle', 'xsub', 'dvb_teletext'].includes(stream.codec_name)
}


export function choosePresetOptions(preset: Preset) {
	const type = process.env.TRANSCODE_TYPE || 'software';

	switch (type) {
		case 'vaapi':
			return vaapiPresetOptions(preset);
		case 'nvenc':
			return cudaPresetOptions(preset);
		case 'software':
		default:
			return `-preset ${preset}`;
	}
}
