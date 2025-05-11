import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { VideoService } from './video.service';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffmpegPath from 'ffmpeg-static';
import * as ffprobePath from 'ffprobe-static';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {
    ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);
    ffmpeg.setFfprobePath(ffprobePath.path);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: './uploads',
    }),
  )
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    const uploadPath = file.path;
    const videoId = path.parse(file.filename).name;
    const hlsFolder = `hls/${videoId}`;

    fs.mkdirSync(hlsFolder, { recursive: true });

    // Định nghĩa các độ phân giải
    const resolutions = [
      { width: 640, height: 360, bitrate: '800k', audioBitrate: '96k' }, // 360p
      { width: 854, height: 480, bitrate: '1400k', audioBitrate: '128k' }, // 480p
      { width: 1280, height: 720, bitrate: '2800k', audioBitrate: '128k' }, // 720p
      { width: 1920, height: 1080, bitrate: '5000k', audioBitrate: '192k' }, // 1080p
    ];

    // Tạo master playlist
    let masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3`;

    // Lấy thông tin video gốc
    const getVideoInfo = () => {
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(uploadPath, (err, metadata) => {
          if (err) reject(err);
          resolve(metadata);
        });
      });
    };

    try {
      const videoInfo = await getVideoInfo() as any;
      const originalWidth = videoInfo.streams[0].width;
      const originalHeight = videoInfo.streams[0].height;
      const aspectRatio = originalWidth / originalHeight;

      // Xử lý từng độ phân giải
      const promises = resolutions.map(async (resolution) => {
        const { width, height, bitrate, audioBitrate } = resolution;
        const outputPath = `${hlsFolder}/${width}x${height}.m3u8`;

        // Tính toán kích thước mới giữ nguyên tỷ lệ
        let newWidth = width;
        let newHeight = height;
        let padWidth = 0;
        let padHeight = 0;

        if (aspectRatio > width / height) {
          // Video gốc rộng hơn
          newHeight = Math.round(width / aspectRatio);
          padHeight = height - newHeight;
        } else {
          // Video gốc cao hơn
          newWidth = Math.round(height * aspectRatio);
          padWidth = width - newWidth;
        }

        return new Promise((resolve, reject) => {
          ffmpeg(uploadPath)
            .outputOptions([
              '-profile:v baseline',
              '-level 3.0',
              '-start_number 0',
              '-hls_time 10',
              '-hls_list_size 0',
              '-f hls',
              `-vf scale=${newWidth}:${newHeight},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
              `-b:v ${bitrate}`,
              `-b:a ${audioBitrate}`,
            ])
            .output(outputPath)
            .on('end', () => {
              // Thêm stream vào master playlist
              masterPlaylist += `\n#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(bitrate) * 1000},RESOLUTION=${width}x${height}
${width}x${height}.m3u8`;
              resolve(null);
            })
            .on('error', (err) => {
              console.error(`Error processing ${width}x${height}:`, err);
              reject(err);
            })
            .run();
        });
      });

      await Promise.all(promises);
      
      // Lưu master playlist
      fs.writeFileSync(`${hlsFolder}/master.m3u8`, masterPlaylist);
      
      // Xóa file gốc
      fs.unlinkSync(uploadPath);

      return {
        message: 'Upload and conversion successful',
        playlist: `/hls/${videoId}/master.m3u8`,
        resolutions: resolutions.map(r => `${r.width}x${r.height}`),
      };
    } catch (error) {
      console.error('Error processing video:', error);
      throw error;
    }
  }
}
