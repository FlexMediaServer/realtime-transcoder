import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TranscoderModule } from './transcoder/transcoder.module';
import * as net from 'net';

@Module({
  imports: [TranscoderModule],
  controllers: [AppController],
  providers: [AppService
    // , {
  //   provide: 'TCPServerService',
  //   useFactory: () => {
  //     const server = net.createServer(socket => {
  //       socket.pipe(

  //       )
  //     });

  //     server.listen(32403, '127.0.0.1');

  //     return server;
  //   }
  // }
],
})
export class AppModule {}
