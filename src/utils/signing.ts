import crypto from 'crypto';

export function verifyUrl(fullUrl: string): boolean {
    try {
        const secret = process.env.SIGNING_SECRET;
        if (!secret) return false;

        const url = new URL(fullUrl);
        const receivedSignature = url.searchParams.get('signature');
        const expiresRaw = url.searchParams.get('expires');

        if (!receivedSignature || !expiresRaw) return false;

        const expires = Number.parseInt(expiresRaw, 10);
        if (Number.isNaN(expires) || Date.now() > expires) return false;

        // Remove signature to get the original signed data
        url.searchParams.delete('signature');
        url.searchParams.sort();
        const dataToVerify = url.searchParams.toString();

        // Re-calculate the expected signature
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(dataToVerify)
            .digest('hex');

        const received = Buffer.from(receivedSignature, 'hex');
        const expected = Buffer.from(expectedSignature, 'hex');

        if (received.length !== expected.length) return false;

        // Use timingSafeEqual to prevent timing attacks
        return crypto.timingSafeEqual(received, expected);
    } catch {
        return false;
    }
}