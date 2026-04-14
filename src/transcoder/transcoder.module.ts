import { Module } from '@nestjs/common';
import { TranscoderService } from './transcoder.service';
import { TranscoderController } from './transcoder.controller';
import { TranscoderHLSController } from './transcoder.hls.controller';
import { TranscoderDASHController } from './transcoder.dash.controller';
import { TranscoderHTTPController } from './transcoder.http.controller';
import { JwtService } from '@nestjs/jwt';

@Module({
	providers: [TranscoderService, JwtService],
	controllers: [TranscoderController, TranscoderHLSController, TranscoderDASHController, TranscoderHTTPController],
})
export class TranscoderModule {}
