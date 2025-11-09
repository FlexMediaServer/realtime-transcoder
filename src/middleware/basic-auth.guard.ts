// basic-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Basic ')) {
        request.res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
        throw new UnauthorizedException('Missing Authorization Header');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const [username, password] = Buffer.from(base64Credentials, 'base64')
      .toString('ascii')
      .split(':');

    // Replace these with your real credential check
    const validUser = process.env.BASIC_AUTH_USER || 'admin';
    const validPass = process.env.BASIC_AUTH_PASS || 'admin';

    if (username === validUser && password === validPass) {
      return true;
    }

    throw new UnauthorizedException('Invalid Credentials');
  }
}
