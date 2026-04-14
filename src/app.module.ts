import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TranscoderModule } from './transcoder/transcoder.module';
import * as net from 'net';
import { JwtModule } from '@nestjs/jwt';

@Module({
	imports: [
		TranscoderModule, 
		JwtModule.register({
			secret: process.env.SIGNING_SECRET ?? 'Really? You were too lazy to set one?'
		})
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
