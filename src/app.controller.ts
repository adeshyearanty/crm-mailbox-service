import { Controller, Get, Version } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  @Version('1')
  @Get('/endpoint')
  @ApiOperation({ summary: 'Get Service REST Endpoint' })
  @ApiResponse({ status: 200, description: 'Returns Service REST Endpoint' })
  restEndpoint() {
    const host = this.configService.get<string>('HOST', 'localhost');
    const port = this.configService.get<number>('PORT', 3006);
    return {
      message: 'Mail box Service is running on',
      baseUrl: `http://${host}:${port}`,
    };
  }

  @Version('1')
  @Get('/health')
  @ApiOperation({ summary: 'Check health' })
  @ApiResponse({ status: 200, description: 'Health check passed' })
  checkHealth() {
    return { status: 'ok' };
  }

  @Version('1.2')
  @Get('/health')
  @ApiOperation({ summary: 'Check health' })
  @ApiResponse({ status: 200, description: 'Health check passed' })
  v12_checkHealth() {
    return { status: 'ok v1.2!' };
  }
}
