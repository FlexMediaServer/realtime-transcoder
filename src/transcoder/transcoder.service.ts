/* eslint-disable @typescript-eslint/no-require-imports */
import { Injectable, Options } from '@nestjs/common';
import { TranscodeSession } from './transcode.session';

export const segmentThrottleSeconds = 240;

class Emitter extends require('events') {
	emit(type, ...args) {
		// console.log(type + ' emitted');
		super.emit(type, ...args);
	}
}

@Injectable()
export class TranscoderService {
	sessions: { [id: string]: TranscodeSession } = {};
	transcodeFolder = process.env.TRANSCODE_FOLDER || '/tmp';

	eventBus = new Emitter();

	constructor() {
		setInterval(
			async () => {
				for (const session of Object.values(this.sessions)) {
					const inactiveFor = Date.now() - session.lastActivityTs;
					if (inactiveFor > 30 * 60 * 1000) {
						await session.stop()
						delete this.sessions[session.id];
					}
				}
			},
			5 * 60 * 1000,
		);
	}


	/*
	: {
		type: 'hls' | 'dash' | 'http', 
		url: string, 
		audioTrack = -1, subtitleTrack = null, sessionId = randomstring.generate(20), offset = 0
	}
		*/
	async startSession(options: ConstructorParameters<typeof TranscodeSession>[0]): Promise<InstanceType<typeof TranscodeSession>> {
		const session = new TranscodeSession(options);
		this.sessions[session.id] = session;

		await session.start()

		return session;
	}

	getSession(sessionId) {
		return this.sessions[sessionId];
	}
}
