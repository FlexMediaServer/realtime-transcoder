import { Preset } from 'src/transcoder/transcoder.dto';

export function cudaPresetOptions(preset: Preset) {
	return (
		{
			ultrafast: '-preset p1',
			superfast: '-preset p2',
			veryfast: '-preset p3',
			fast: '-preset p4',
			slow: '-preset p5',
			slower: '-preset p6',
			veryslow: '-preset p7',
		}[preset] || ''
	);
}
