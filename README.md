# Realtime Transcoder

## Signed start URLs

The transcoder now requires HMAC-signed URLs for all session start endpoints:

- `GET /session/start`
- `GET /session/start.m3u8`
- `GET /session/start.mpd`

Set `URL_SIGNING_SECRET` in the runtime environment. Requests must include:

- `expires`: Unix timestamp in seconds.
- `signature`: Hex-encoded HMAC-SHA256 signature.

Example Node.js signing snippet:

```js
const crypto = require('node:crypto');

function signStartUrl(pathname, query, secret, expires) {
	const params = new URLSearchParams({ ...query, expires: String(expires) });
	const sorted = [...params.entries()].sort(([aKey, aValue], [bKey, bValue]) => {
		if (aKey === bKey) return aValue.localeCompare(bValue);
		return aKey.localeCompare(bKey);
	});

	const payload = `${pathname}?${sorted
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
		.join('&')}`;

	return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
```