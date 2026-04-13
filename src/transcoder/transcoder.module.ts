import { Module } from '@nestjs/common';
import { SignedUrlGuard } from 'src/middleware/signed-url.guard';
import { TranscoderService } from './transcoder.service';
import { TranscoderController } from './transcoder.controller';
import { TranscoderHLSController } from './transcoder.hls.controller';
import { TranscoderDASHController } from './transcoder.dash.controller';
import { TranscoderHTTPController } from './transcoder.http.controller';
import { UrlSigningService } from './url-signing.service';

@Module({
	providers: [TranscoderService, UrlSigningService, SignedUrlGuard],
	controllers: [TranscoderController, TranscoderHLSController, TranscoderDASHController, TranscoderHTTPController],
})
export class TranscoderModule {}
