import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CalendarEvent,
  CalendarEventSchema,
} from './schemas/calendar-event.schema';
import {
  LoggedMeeting,
  LoggedMeetingSchema,
} from './schemas/logged-meeting.schema';
import { CalenderSyncController } from './controller/calendar.controller';
import { MicrosoftService } from './service/microsoft.service';
import { GoogleCalendarService } from './service/google.service';
import { ActivityClientService } from './client/activity-client.service';
import { S3ClientService } from './client/s3-client.service';
import { TaskClientService } from './client/task-client.service';
// import { TaskModule } from '../../task/task.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule,
    MongooseModule.forFeature([
      { name: CalendarEvent.name, schema: CalendarEventSchema },
      { name: LoggedMeeting.name, schema: LoggedMeetingSchema },
    ]),
    // TaskModule
  ],
  controllers: [CalenderSyncController],
  providers: [
    MicrosoftService,
    GoogleCalendarService,
    ActivityClientService,
    S3ClientService,
    TaskClientService,
  ],
})
export class CalendarModule {}
