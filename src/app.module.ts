import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller';
import { CalendarModule } from './calendar/calendar.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env`,
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3006),
        MONGO_USER: Joi.string().required(),
        MONGO_PASSWORD: Joi.string().required(),
        MONGO_DATABASE: Joi.string().required(),
      }),
    }),
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri: `mongodb+srv://${configService.get(
          'MONGO_USER',
        )}:${configService.get(
          'MONGO_PASSWORD',
        )}@miraki-training.gn5hy.mongodb.net/${configService.get(
        // )}@gamyam.tumrpaj.mongodb.net/${configService.get(
          'MONGO_DATABASE',
        )}?retryWrites=true&w=majority`,
      }),
      inject: [ConfigService],
    }),
    CalendarModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
