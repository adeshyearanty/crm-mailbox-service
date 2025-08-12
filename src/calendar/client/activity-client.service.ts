import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosResponse, AxiosError } from 'axios';
import { ConfigService } from '@nestjs/config';

// Define proper types for activity logging
interface ActivityPayload {
  leadId: string;
  activityType: string;
  description: string;
  performedBy: string;
  metadata?: Record<string, unknown>;
}

interface ActivityQueryParams {
  leadId?: string;
  page?: number;
  limit?: number;
  activityType?: string;
  performedBy?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class ActivityClientService {
  private readonly logger = new Logger(ActivityClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private get API_BASE_URL(): string {
    const url = this.configService.get<string>('ACTIVITY_CLIENT_URL');
    if (!url) {
      this.logger.error('ACTIVITY_CLIENT_URL is not defined in configuration');
      throw new InternalServerErrorException(
        'Activity client base URL is not configured',
      );
    }
    return url;
  }

  async logActivity(payload: ActivityPayload): Promise<unknown> {
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
        'Error while logging activity',
        responseData || errorMessage,
      );
      throw new InternalServerErrorException('Failed to log activity');
    }
  }

  async fetchActivities(
    queryParams: ActivityQueryParams = {},
  ): Promise<unknown> {
    try {
      const response: AxiosResponse = await this.httpService.axiosRef.get(
        `${this.API_BASE_URL}`,
        {
          params: queryParams,
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
        'Error while fetching activities',
        responseData || errorMessage,
      );
      throw new InternalServerErrorException('Failed to fetch activities');
    }
  }
}
