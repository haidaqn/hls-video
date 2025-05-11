import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe } from "@nestjs/common";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(new ValidationPipe());
  
  app.useStaticAssets(join(__dirname, '../uploads'), { prefix: '/uploads' });
  app.useStaticAssets(join(__dirname, '../hls'), { 
    prefix: '/hls',
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
    }
  });
  
  app.enableCors({
    origin: true, // Cho phép tất cả các origin trong development
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  
  await app.listen(3000);
}

bootstrap();
