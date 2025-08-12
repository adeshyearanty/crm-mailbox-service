import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';

@Injectable()
export class TaskClientService {
  private readonly logger = new Logger(TaskClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private get API_BASE_URL(): string {
    const url = this.configService.get<string>('TASK_CLIENT_URL');
    if (!url) {
      this.logger.error('TASK_CLIENT_URL is not defined in configuration');
      throw new InternalServerErrorException(
        'Task client base URL is not configured',
      );
    }
    return url;
  }

  async createTask(payload: any): Promise<any> {
    try {
      const response: AxiosResponse = await this.httpService.axiosRef.post(
        `${this.API_BASE_URL}`,
        payload,
        {
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
        'Error while creating task',
        responseData || errorMessage,
      );
      throw new InternalServerErrorException('Failed to create task');
    }
  }
}
