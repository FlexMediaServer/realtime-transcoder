import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyUrl } from 'src/utils/signing';

@Injectable()
export class UrlSignatureGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest();
		const host = request.headers['x-forwarded-host'] || request.headers.host;
		const proto = request.headers['x-forwarded-proto'] || request.protocol || 'http';
		const originalUrl = request.originalUrl || request.url;

		if (!host || !originalUrl) {
			throw new UnauthorizedException('Invalid signed URL');
		}

		const fullUrl = `${proto}://${host}${originalUrl}`;
		const isValid = verifyUrl(fullUrl);

		if (!isValid) {
			throw new UnauthorizedException('Invalid or expired signature');
		}

		return true;
	}
}
