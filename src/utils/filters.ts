import Ffmpeg, { FilterSpecification } from 'fluent-ffmpeg';
import { vaapiPresetOptions } from './hwaccel/vaapi';
import { Preset } from 'src/transcoder/transcoder.dto';
import { cudaPresetOptions } from './hwaccel/cuda';

export function buildSubtitleFilterInlineass(): string {
	return `inlineass=font_scale=1.250000:font_path=/usr/src/app/assets/NotoSans-Medium.otf:fontconfig_file=/usr/src/app/assets/fonts.conf:language=en`;
}

export function buildScaleFilter(resolution: string): string {
	const type = process.env.TRANSCODE_TYPE || 'software';

	const [w, h] = resolution.split('x');

	switch (type) {
		case 'nvenc':
			return `scale_cuda=w=${w}:h=${h}:format=nv12`;
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
