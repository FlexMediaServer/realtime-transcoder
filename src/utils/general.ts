import fs from 'fs';

export function pipeWait(stream, destination) {
	return new Promise((resolve, reject) => {
		stream.pipe(destination, { end: false });
		stream.on('end', resolve);
		stream.on('error', reject);
	});
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
