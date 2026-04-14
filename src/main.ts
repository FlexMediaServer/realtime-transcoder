import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import util from 'node:util';

const debugFn = console.debug;
console.debug = function (...properties) {
	if (process.env.LOG_LEVEL === 'debug') debugFn('[DEBUG]', ...properties)
};

const infoFn = console.info;
console.info = function (...properties) {
	if (process.env.LOG_LEVEL === 'info' || process.env.LOG_LEVEL === 'debug') infoFn('[INFO]', ...properties)
};

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.enableCors();
	app.useGlobalPipes(new ValidationPipe());

	await app.listen(process.env.PORT ?? 32402);
}
bootstrap();
  