import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

type SignableQueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

@Injectable()
export class UrlSigningService {
	private readonly signatureParam = 'signature';
	private readonly expiresParam = 'expires';

	private getSecret() {
		const secret = process.env.URL_SIGNING_SECRET;

		if (!secret) {
			throw new InternalServerErrorException('URL_SIGNING_SECRET is not configured');
		}

		return secret;
	}

	private normalizeQueryEntries(query: Record<string, unknown>) {
		const entries: Array<[string, string]> = [];

		for (const [key, rawValue] of Object.entries(query)) {
			if (key === this.signatureParam || rawValue === undefined || rawValue === null) continue;

			const values = Array.isArray(rawValue) ? rawValue : [rawValue];

			for (const value of values) {
				entries.push([key, String(value)]);
			}
		}

		entries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
			if (leftKey === rightKey) return leftValue.localeCompare(rightValue);
			return leftKey.localeCompare(rightKey);
		});

		return entries;
	}

	private canonicalizePath(pathname: string, query: Record<string, unknown>) {
		const search = this.normalizeQueryEntries(query)
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');

		return search ? `${pathname}?${search}` : pathname;
	}

	private createSignature(payload: string) {
		return createHmac('sha256', this.getSecret()).update(payload).digest('hex');
	}

	private safeCompareSignature(left: string, right: string) {
		const leftBuffer = Buffer.from(left, 'hex');
		const rightBuffer = Buffer.from(right, 'hex');

		if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
			return false;
		}

		return timingSafeEqual(leftBuffer, rightBuffer);
	}

	buildSignedQuery(pathname: string, query: Record<string, SignableQueryValue>, expiresAt: number) {
		const signableQuery = {
			...query,
			[this.expiresParam]: expiresAt,
		};

		return {
			...signableQuery,
			[this.signatureParam]: this.createSignature(this.canonicalizePath(pathname, signableQuery)),
		};
	}

	verify(pathname: string, query: Record<string, unknown>) {
		const signature = query[this.signatureParam];
		const expires = query[this.expiresParam];

		if (typeof signature !== 'string' || signature.length === 0) {
			return { valid: false, reason: 'Missing URL signature' };
		}

		if (typeof expires !== 'string' && typeof expires !== 'number') {
			return { valid: false, reason: 'Missing URL expiry' };
		}

		const expiresAt = Number(expires);

		if (!Number.isFinite(expiresAt)) {
			return { valid: false, reason: 'Invalid URL expiry' };
		}

		if (expiresAt < Math.floor(Date.now() / 1000)) {
			return { valid: false, reason: 'URL signature expired' };
		}

		const payload = this.canonicalizePath(pathname, query);
		const expectedSignature = this.createSignature(payload);

		if (!this.safeCompareSignature(signature.toLowerCase(), expectedSignature)) {
			return { valid: false, reason: 'Invalid URL signature' };
		}

		return { valid: true };
	}
}