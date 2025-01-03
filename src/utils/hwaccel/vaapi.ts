import { Codec, Preset } from 'src/transcoder/transcoder.dto';

export function vaapiPresetOptions(preset: Preset) {
	return (
		{
			ultrafast: '-compression_level 0',
			superfast: '-compression_level 1',
			veryfast: '-compression_level 1',
			fast: '-compression_level 1',
			slow: '-compression_level 11',
			slower: '-compression_level 19',
			veryslow: '-compression_level 29',
		}[preset] || ''
	);
}
