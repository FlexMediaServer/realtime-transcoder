import { Module } from '@nestjs/common';
import { TranscoderService } from './transcoder.service';
import { TranscoderController } from './transcoder.controller';
import { TranscoderHLSController } from './transcoder.hls.controller';
import { TranscoderDASHController } from './transcoder.dash.controller';

@Module({
  providers: [TranscoderService],
  controllers: [TranscoderController, TranscoderHLSController, TranscoderDASHController]
})
export class TranscoderModule {}
