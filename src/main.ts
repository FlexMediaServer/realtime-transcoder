import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import 'dotenv/config';
import util from 'util';

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
	// const express = app.getHttpAdapter();
	// express.post('/transcoder/:id/manifest', (req, res) => {
	// 	req.setEncoding('utf8');
	// 	req.on('data', (data) => {
	// 		console.log(data);
	// 	});
	// });

	// express.post('/transcoder/:id/progress', (req, res) => {
	// 	req.setEncoding('utf8');
	// 	req.on('data', (data) => {
	// 		console.log(data);
	// 	});
	// });

	// express.post('/transcoder/:id/progress_url', (req, res) => {
	// 	req.setEncoding('utf8');
	// 	req.on('data', (data) => {
	// 		console.log(data);
	// 	});
	// });

	await app.listen(process.env.PORT ?? 32402);
}
bootstrap();
