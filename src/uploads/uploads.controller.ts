import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CloudinaryService } from './cloudinary.service';
import { imageFileFilter } from './image-file-filter';

// One generic endpoint, reused by the Add Property screen for both property
// photos and the ownership document — the mobile app calls this once per
// file (multipart/form-data, field name "file"), gets back a URL, and
// collects those URLs into photoUrls[] / ownershipDocUrl before submitting
// the property itself via POST /properties.
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: imageFileFilter,
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file was uploaded (expected field name "file")');
    }

    const result = await this.cloudinaryService.uploadImage(file);
    return { url: result.secure_url };
  }
}
