import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UrlSigningService } from 'src/transcoder/url-signing.service';

@Injectable()
export class SignedUrlGuard implements CanActivate {
	constructor(private readonly urlSigningService: UrlSigningService) {}

	canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest();
		const verification = this.urlSigningService.verify(request.path, request.query);

		if (!verification.valid) {
			throw new ForbiddenException(verification.reason);
		}

		return true;
	}
}