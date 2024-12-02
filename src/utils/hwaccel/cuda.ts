export function encoder (codec: 'h264' | 'hevc') {
	return codec == 'hevc' ? 'hevc_nvenc' : 'h264_nvenc'
}

export function scale (resolution: string = '1920x1080') {
	const res = resolution.split('x');
	return `scale_cuda=w=${res[0] == '-1' ? '-2' : res[0]}:h=${res[1] == '-1' ? '-2' : res[1]}`
}