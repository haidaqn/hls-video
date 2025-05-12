import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { storage } from './os/oss';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // for upload
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: 'uploads',
      storage: storage,
      limits: {
        fileSize: 1024 * 1024 * 3,
      },
      fileFilter(
        req: any,
        file: {
          fieldname: string;
          originalname: string;
          encoding: string;
          mimetype: string;
          size: number;
          destination: string;
          filename: string;
          path: string;
          buffer: Buffer;
        },
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) {
        const extname = path.extname(file.originalname);
        if (['.jpg', '.png', '.gif'].includes(extname)) {
          callback(null, true);
        } else {
          callback(new BadRequestException('upload file error'), false);
        }
      },
    }),
  )
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    return file.path;
  }

  ///

  @Post('upload/large-file')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      dest: 'uploads',
    }),
  )
  uploadFileLarge(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body()
    body: {
      name: string;
    },
  ) {
    const fileName = body.name.match(/(.+)-\d+$/)?.[1] ?? body.name;

    const nameDir = `uploads/chunk-${fileName}`;

    if (!fs.existsSync(nameDir)) {
      fs.mkdirSync(nameDir);
    }

    fs.cpSync(files[0].path, nameDir + '/' + body.name);

    fs.rmSync(files[0].path);
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // merge

  @Get('merge/file')
  mergeFile(@Query('fileName') fileName: string) {
    const nameDir = 'uploads/' + fileName;
    const files = fs.readdirSync(nameDir);
    console.log(nameDir);
    let startPos = 0,
      count = 0;

    files.map((file) => {
      // get path full
      const filePath = nameDir + '/' + file;
      const streamFile = fs.createReadStream(filePath);
      streamFile
        .pipe(
          fs.createWriteStream(`uploads/merge/${fileName}`, {
            start: startPos,
          }),
        )
        .on('finish', () => {
          count++;

          console.log('file length', file.length);
          console.log('count', count);
          if (files.length === count) {
            fs.rm(
              nameDir,
              {
                recursive: true,
              },
              () => {},
            );
          }
        });
      startPos += fs.statSync(filePath).size;
    });
  }
}
