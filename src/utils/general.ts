import Ffmpeg, { FfprobeStream } from 'fluent-ffmpeg';
import fs from 'fs';

export function pipeWait(stream, destination) {
    return new Promise((resolve, reject) => {
        const onData = chunk => {
            if (!destination.write(chunk)) {
                // Backpressure: pause reading
                stream.pause();
                destination.once('drain', () => stream.resume());
            }
        };

        const onEnd = () => cleanup(resolve);
        const onError = err => cleanup(() => reject(err));
        const onClose = () => cleanup(resolve);

        const cleanup = (done) => {
            stream.removeListener('data', onData);
            stream.removeListener('end', onEnd);
            stream.removeListener('error', onError);
            destination.removeListener('close', onClose);
            done();
        };

        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onError);
        destination.on('close', onClose);
    });
}

export function getStream (metadata: Ffmpeg.FfprobeData, index) {
	return metadata.streams.find((stream) => stream.index == index)
}

export function waitForFile(filePath: string, interval = 1000): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const checkFile = () => {
			fs.stat(filePath, (err, stats) => {
				if (!err && stats.size > 0) {
					// resolve();
					setTimeout(resolve, 1);
				} else if (err && err.code === 'ENOENT') {
					setTimeout(checkFile, interval);
				} else {
					setTimeout(checkFile, interval);
				}
			});
		};
		checkFile();
	});
}
