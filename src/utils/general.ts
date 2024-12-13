export function pipeWait (stream, destination) {
	return new Promise((resolve, reject) => {
		stream.pipe(destination, { end: false })
		stream.on('close', resolve)
		stream.on('error', reject)
	})
}