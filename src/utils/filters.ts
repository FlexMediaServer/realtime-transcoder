import { FilterSpecification } from 'fluent-ffmpeg';
import { vaapiPresetOptions } from './hwaccel/vaapi';
import { Preset } from 'src/transcoder/transcoder.dto';
import { cudaPresetOptions } from './hwaccel/cuda';

export function buildSubtitleFilterInlineass(): string {
	return `inlineass=font_scale=1.250000:font_path=/home/blakebuell/Development/realtime-transcoder/assets/NotoSans-Medium.otf:fontconfig_file=/home/blakebuell/Development/realtime-transcoder/assets/fonts.conf:language=en`;
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
