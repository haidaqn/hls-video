import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VideoModule } from './video/video.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    VideoModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'hls'),
      serveRoot: '/hls',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
