import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkHealth', () => {
    it('should return "ok"', () => {
      const result = appController.checkHealth();
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('v12_checkHealth', () => {
    it('should return "ok v1.2!"', () => {
      const result = appController.v12_checkHealth();
      expect(result).toEqual({ status: 'ok v1.2!' });
    });
  });

  describe('restEndpoint', () => {
    it('should return service endpoint information', () => {
      mockConfigService.get
        .mockReturnValueOnce('localhost')
        .mockReturnValueOnce(3006);

      const result = appController.restEndpoint();

      expect(mockConfigService.get).toHaveBeenCalledWith('HOST', 'localhost');
      expect(mockConfigService.get).toHaveBeenCalledWith('PORT', 3006);
      expect(result).toEqual({
        message: 'Utility Service is running on',
        baseUrl: 'http://localhost:3006',
      });
    });
  });
});
