import { beforeEach, describe, it } from 'node:test';
import { UrlSigningService } from './url-signing.service';

describe('UrlSigningService', () => {
	const previousSecret = process.env.URL_SIGNING_SECRET;
	let service: UrlSigningService;

	beforeEach(() => {
		process.env.URL_SIGNING_SECRET = 'test-secret';
		service = new UrlSigningService();
	});

	afterAll(() => {
		if (previousSecret === undefined) {
			delete process.env.URL_SIGNING_SECRET;
			return;
		}

		process.env.URL_SIGNING_SECRET = previousSecret;
	});

	it('verifies a valid signed URL regardless of query ordering', () => {
		const expiresAt = Math.floor(Date.now() / 1000) + 60;
		const signedQuery = service.buildSignedQuery('/session/start.m3u8', {
			url: 'https://example.com/video.mp4?foo=bar&baz=1',
			session: 'abc123',
			audioTrack: 1,
		}, expiresAt);

		expect(service.verify('/session/start.m3u8', {
			audioTrack: signedQuery.audioTrack,
			signature: signedQuery.signature,
			session: signedQuery.session,
			url: signedQuery.url,
			expires: signedQuery.expires,
		})).toEqual({ valid: true });
	});

	it('rejects expired signed URLs', () => {
		const signedQuery = service.buildSignedQuery('/session/start', {
			url: 'https://example.com/video.mp4',
			session: 'http-session',
		}, Math.floor(Date.now() / 1000) - 1);

		expect(service.verify('/session/start', signedQuery)).toEqual({
			valid: false,
			reason: 'URL signature expired',
		});
	});

	it('rejects tampered signed URLs', () => {
		const expiresAt = Math.floor(Date.now() / 1000) + 60;
		const signedQuery = service.buildSignedQuery('/session/start.mpd', {
			url: 'https://example.com/video.mp4',
			bitrate: 2000,
		}, expiresAt);

		expect(service.verify('/session/start.mpd', {
			...signedQuery,
			bitrate: 3000,
		})).toEqual({
			valid: false,
			reason: 'Invalid URL signature',
		});
	});
});

function afterAll(arg0: () => void) {
	throw new Error('Function not implemented.');
}
function expect(arg0: { valid: boolean; reason: string; } | { valid: boolean; reason?: undefined; }) {
	throw new Error('Function not implemented.');
}

