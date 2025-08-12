import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse, AxiosError } from 'axios';

// Define proper types for S3 operations
interface PresignedUrlResponse {
  url: string;
  key: string;
}

interface AccessUrlResponse {
  url: string;
  key: string;
}

interface DeleteObjectResponse {
  success: boolean;
  message: string;
}

@Injectable()
export class S3ClientService {
  private readonly logger = new Logger(S3ClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private get API_BASE_URL(): string {
    const url = this.configService.get<string>('S3_CLIENT_URL');
    if (!url) {
      this.logger.error('S3_CLIENT_URL is not defined in configuration');
      throw new InternalServerErrorException(
        'S3 client base URL is not configured',
      );
    }
    return url;
  }

  async generatePresignedUrl(
    key: string,
    contentType: string,
  ): Promise<string> {
    try {
      const response: AxiosResponse<PresignedUrlResponse> =
        await this.httpService.axiosRef.post(
          `${this.API_BASE_URL}/generate-presigned-url`,
          { key, contentType },
          {
            headers: {
              'x-api-key': this.configService.get<string>('X_API_KEY'),
            },
          },
        );
      return response.data.url;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const responseData =
        error && typeof error === 'object' && 'response' in error
          ? (error as AxiosError).response?.data
          : undefined;

      this.logger.error(
        'Error while generating presigned URL',
        responseData || errorMessage,
      );
      throw new InternalServerErrorException(
        'Failed to generate presigned URL',
      );
    }
  }

  async generateAccessUrl(key: string): Promise<string> {
    try {
      const response: AxiosResponse<AccessUrlResponse> =
        await this.httpService.axiosRef.post(
          `${this.API_BASE_URL}/generate-access-url`,
          { key },
          {
            headers: {
              'x-api-key': this.configService.get<string>('X_API_KEY'),
            },
          },
        );
      return response.data.url;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const responseData =
        error && typeof error === 'object' && 'response' in error
          ? (error as AxiosError).response?.data
          : undefined;

      this.logger.error(
        'Error while generating access URL',
        responseData || errorMessage,
      );
      throw new InternalServerErrorException('Failed to generate access URL');
    }
  }

  async deleteObject(key: string): Promise<DeleteObjectResponse> {
    try {
      const response: AxiosResponse<DeleteObjectResponse> =
        await this.httpService.axiosRef.delete(
          `${this.API_BASE_URL}/delete-object`,
          {
            data: { key }, // ✅ send key in body
            headers: {
              'x-api-key': this.configService.get<string>('X_API_KEY'),
            },
          },
        );
      return response.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const responseData =
        error && typeof error === 'object' && 'response' in error
          ? (error as AxiosError).response?.data
          : undefined;

      this.logger.error(
        'Error while deleting object',
        responseData || errorMessage,
      );
      throw new InternalServerErrorException('Failed to delete object');
    }
  }
}
