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
    const hlsFolder = path.join(process.cwd(), 'hls', videoId);

    // Tạo thư mục gốc nếu chưa tồn tại
    if (!fs.existsSync(path.join(process.cwd(), 'hls'))) {
      fs.mkdirSync(path.join(process.cwd(), 'hls'), { recursive: true });
    }

    // Tạo thư mục cho video
    if (!fs.existsSync(hlsFolder)) {
      fs.mkdirSync(hlsFolder, { recursive: true });
    }

    // Định nghĩa các độ phân giải với bandwidth
    const resolutions = [
      { 
        width: 640, 
        height: 360, 
        bitrate: '800k', 
        audioBitrate: '96k',
        bandwidth: 1000000, // 1Mbps
        name: '360p'
      },
      { 
        width: 854, 
        height: 480, 
        bitrate: '1400k', 
        audioBitrate: '128k',
        bandwidth: 2000000, // 2Mbps
        name: '480p'
      },
      { 
        width: 1280, 
        height: 720, 
        bitrate: '2800k', 
        audioBitrate: '128k',
        bandwidth: 4000000, // 4Mbps
        name: '720p'
      },
      { 
        width: 1920, 
        height: 1080, 
        bitrate: '5000k', 
        audioBitrate: '192k',
        bandwidth: 8000000, // 8Mbps
        name: '1080p'
      },
    ];

    // Tạo master playlist
    let masterPlaylist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS`;

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
        const { width, height, bitrate, audioBitrate, bandwidth, name } = resolution;
        const outputPath = path.join(hlsFolder, name);

        // Tạo thư mục cho độ phân giải
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }

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
              '-hls_time 5', // Mỗi segment 5 giây
              '-hls_list_size 0',
              '-hls_segment_type mpegts',
              '-f hls',
              `-vf scale=${newWidth}:${newHeight},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
              `-b:v ${bitrate}`,
              `-b:a ${audioBitrate}`,
              '-hls_flags independent_segments+program_date_time+split_by_time',
              '-hls_playlist_type vod',
              '-hls_segment_filename', path.join(outputPath, '%d.ts'),
              '-hls_key_info_file', path.join(outputPath, 'key_info.txt'),
              '-hls_enc 1',
              '-hls_enc_key', path.join(outputPath, 'enc.key'),
              '-hls_enc_iv', path.join(outputPath, 'enc.iv'),
              '-hls_segment_type mpegts',
              '-hls_allow_cache 0',
              '-hls_base_url', `${name}/`,
            ])
            .output(path.join(outputPath, 'playlist.m3u8'))
            .on('end', () => {
              // Thêm stream vào master playlist với thông tin bandwidth và codecs
              masterPlaylist += `\n#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height},NAME="${name}",CODECS="avc1.42e01e,mp4a.40.2"
${name}/playlist.m3u8`;
              resolve(null);
            })
            .on('error', (err) => {
              console.error(`Error processing ${name}:`, err);
              reject(err);
            })
            .run();
        });
      });

      await Promise.all(promises);
      
      // Lưu master playlist
      fs.writeFileSync(path.join(hlsFolder, 'master.m3u8'), masterPlaylist);
      
      // Xóa file gốc
      fs.unlinkSync(uploadPath);

      return {
        message: 'Upload and conversion successful',
        playlist: `/hls/${videoId}/master.m3u8`,
        resolutions: resolutions.map(r => r.name),
      };
    } catch (error) {
      console.error('Error processing video:', error);
      // Xóa thư mục hls nếu có lỗi
      if (fs.existsSync(hlsFolder)) {
        fs.rmSync(hlsFolder, { recursive: true, force: true });
      }
      throw error;
    }
  }
}