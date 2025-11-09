import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import 'dotenv/config';
import util from 'node:util';

if (process.env.NODE_ENV !== 'development') {
  console.debug = function () {};
}
const originalConsoleLog = console.log;
console.log =  function (...args) {
	originalConsoleLog(...args.map((arg) => typeof arg === 'object' ? util.inspect(arg, { showHidden: false, depth: null }) : arg));
}

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.enableCors();
	app.useGlobalPipes(new ValidationPipe());

	await app.listen(process.env.PORT ?? 32402);
}
bootstrap();
  