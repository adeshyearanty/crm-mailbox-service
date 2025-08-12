import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Model } from 'mongoose';
import { ActivityClientService } from '../client/activity-client.service';
import { S3ClientService } from '../client/s3-client.service';
import { TaskClientService } from '../client/task-client.service';
import {
  CalendarResponse,
  ContactsResponse,
  DeleteEventResponse,
} from '../dto/calendar-response.dto';
import { CreateEventDto } from '../dto/create-event.dto';
import {
  LogMeetingDto,
  LogMeetingResponseDto,
  MeetingType as DtoMeetingType,
} from '../dto/log-meeting.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import { CalendarEvent } from '../schemas/calendar-event.schema';
import { LoggedMeeting, MeetingType } from '../schemas/logged-meeting.schema';
import { GoogleCalendarService } from '../service/google.service';
import { MicrosoftService } from '../service/microsoft.service';
import { ActivityType, TaskPriority, TaskStatus } from '../types/client-types';

export enum CalendarProvider {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
}

@ApiTags('Calendar')
@Controller({
  version: '1',
  path: 'calendar',
})
export class CalenderSyncController {
  constructor(
    private readonly calenderSyncService: MicrosoftService,
    private readonly googleCalendarService: GoogleCalendarService,
    @InjectModel(CalendarEvent.name)
    private calendarEventModel: Model<CalendarEvent>,
    @InjectModel(LoggedMeeting.name)
    private loggedMeetingModel: Model<LoggedMeeting>,
    private readonly activityClientService: ActivityClientService,
    private readonly s3ClientService: S3ClientService,
    private readonly taskClientService: TaskClientService,
  ) {}

  private validateHeaders(
    authHeader?: string,
    provider?: string,
  ): { accessToken: string; provider: CalendarProvider } {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    if (!provider) {
      throw new BadRequestException('X-Calendar-Provider header is required');
    }

    const normalizedProvider = provider.toLowerCase();
    if (
      !Object.values(CalendarProvider).includes(
        normalizedProvider as CalendarProvider,
      )
    ) {
      throw new BadRequestException(
        `Invalid calendar provider. Must be one of: ${Object.values(CalendarProvider).join(', ')}`,
      );
    }

    const accessToken = authHeader.replace('Bearer ', '');
    if (!accessToken) {
      throw new UnauthorizedException(
        'Invalid authorization header format. Must be Bearer token',
      );
    }

    return { accessToken, provider: normalizedProvider as CalendarProvider };
  }

  @Post('events')
  @ApiOperation({ summary: 'Create a new calendar event' })
  @ApiResponse({ status: 201, type: CalendarResponse })
  @ApiHeader({ name: 'Authorization', description: 'Bearer token' })
  @ApiHeader({
    name: 'X-Calendar-Provider',
    description: 'Calendar provider (google or microsoft)',
    enum: CalendarProvider,
  })
  async createEvent(
    @Body() eventData: CreateEventDto,
    @Headers('authorization') authHeader: string,
    @Headers('x-calendar-provider') provider: string,
  ): Promise<CalendarResponse> {
    const { accessToken, provider: validatedProvider } = this.validateHeaders(
      authHeader,
      provider,
    );

    switch (validatedProvider) {
      case CalendarProvider.GOOGLE:
        return this.googleCalendarService.createEvent(accessToken, eventData);
      case CalendarProvider.MICROSOFT:
        return this.calenderSyncService.createEvent(accessToken, eventData);
    }
  }

  @Get('events')
  @ApiOperation({ summary: 'Get calendar events' })
  @ApiResponse({ status: 200, type: CalendarResponse })
  @ApiHeader({ name: 'Authorization', description: 'Bearer token' })
  @ApiHeader({
    name: 'X-Calendar-Provider',
    description: 'Calendar provider (google or microsoft)',
    enum: CalendarProvider,
  })
  async getEvents(
    @Headers('authorization') authHeader: string,
    @Headers('x-calendar-provider') provider: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    const { accessToken, provider: validatedProvider } = this.validateHeaders(
      authHeader,
      provider,
    );

    switch (validatedProvider) {
      case CalendarProvider.GOOGLE:
        return this.googleCalendarService.getEvents(
          accessToken,
          startTime,
          endTime,
        );
      case CalendarProvider.MICROSOFT:
        return this.calenderSyncService.getEvents(
          accessToken,
          startTime,
          endTime,
        );
    }
  }

  @Delete('events/:eventId')
  @ApiOperation({ summary: 'Delete a calendar event' })
  @ApiResponse({ status: 200, type: DeleteEventResponse })
  @ApiHeader({ name: 'Authorization', description: 'Bearer token' })
  @ApiHeader({
    name: 'X-Calendar-Provider',
    description: 'Calendar provider (google or microsoft)',
    enum: CalendarProvider,
  })
  async deleteEvent(
    @Param('eventId') eventId: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-calendar-provider') provider?: string,
  ): Promise<DeleteEventResponse> {
    // If either header is missing, treat as logged meeting and delete from local DB
    if (!authHeader || !provider) {
      const deletedFromCalendar = await this.calendarEventModel.deleteOne({
        externalId: eventId,
      });
      const deletedFromLogged = await this.loggedMeetingModel.deleteOne({
        _id: eventId,
      });
      const deleted =
        (deletedFromCalendar.deletedCount || 0) +
        (deletedFromLogged.deletedCount || 0);
      if (deleted > 0) {
        return {
          success: true,
          data: {
            message: 'Event deleted from local database',
            eventId: eventId,
          },
          statusCode: 200,
        } as DeleteEventResponse;
      } else {
        throw new BadRequestException('Event not found in local database');
      }
    }

    const { accessToken, provider: validatedProvider } = this.validateHeaders(
      authHeader,
      provider,
    );

    switch (validatedProvider) {
      case CalendarProvider.GOOGLE:
        return this.googleCalendarService.deleteEvent(accessToken, eventId);
      case CalendarProvider.MICROSOFT:
        return this.calenderSyncService.deleteEvent(accessToken, eventId);
    }
  }

  @Patch('events/:eventId')
  @ApiOperation({ summary: 'Update a calendar event' })
  @ApiResponse({ status: 200, type: CalendarResponse })
  @ApiHeader({ name: 'Authorization', description: 'Bearer token' })
  @ApiHeader({
    name: 'X-Calendar-Provider',
    description: 'Calendar provider (google or microsoft)',
    enum: CalendarProvider,
  })
  async updateEvent(
    @Param('eventId') eventId: string,
    @Body() eventData: UpdateEventDto,
    @Headers('authorization') authHeader?: string,
    @Headers('x-calendar-provider') provider?: string,
  ) {
    // If either header is missing, update in local DB
    if (!authHeader || !provider) {
      // Try to update in both collections
      const updatedCalendar = await this.calendarEventModel.findOneAndUpdate(
        { externalId: eventId },
        eventData,
        { new: true },
      );
      const updatedLogged = await this.loggedMeetingModel.findOneAndUpdate(
        { _id: eventId },
        eventData,
        { new: true },
      );
      // Log activity if a logged meeting was updated
      if (updatedLogged) {
        try {
          await this.activityClientService.logActivity({
            leadId: updatedLogged.leadId,
            activityType: ActivityType.CALENDAR_EVENT_UPDATED,
            description: `Meeting updated: ${updatedLogged.title}`,
            performedBy: updatedLogged.loggedBy || 'system',
            metadata: {
              meetingId: updatedLogged._id?.toString(),
              meetingTitle: updatedLogged.title,
              meetingType: updatedLogged.meetingType,
              outcome: updatedLogged.outcome,
              participants: updatedLogged.participants?.length,
            },
          });
        } catch (activityError) {
          console.error(
            'Failed to create activity record for meeting update:',
            activityError,
          );
        }
      }
      const updated = updatedCalendar || updatedLogged;
      if (updated) {
        return {
          success: true,
          data: [updated],
          message: 'Event updated in local database',
        };
      } else {
        throw new BadRequestException('Event not found in local database');
      }
    }

    const { accessToken, provider: validatedProvider } = this.validateHeaders(
      authHeader,
      provider,
    );

    switch (validatedProvider) {
      case CalendarProvider.GOOGLE:
        return this.googleCalendarService.updateEvent(
          accessToken,
          eventId,
          eventData,
        );
      case CalendarProvider.MICROSOFT:
        return this.calenderSyncService.updateEvent(
          accessToken,
          eventId,
          eventData,
        );
    }
  }

  @Get('events/local')
  @ApiOperation({
    summary: 'Get calendar events and logged meetings from local database',
  })
  @ApiResponse({ status: 200, type: CalendarResponse })
  @ApiQuery({ name: 'provider', enum: CalendarProvider, required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'leadId', required: false })
  async getLocalEvents(
    @Query('provider') provider?: string,
    @Query('userId') userId?: string,
    @Query('leadId') leadId?: string,
    @Headers('authorization') authHeader?: string,
    @Headers('x-calendar-provider') calendarProvider?: string,
  ) {
    console.log('Fetching local events with filters:', {
      provider,
      userId,
      leadId,
    });

    try {
      // Query for calendar events
      const calendarQuery: Record<string, unknown> = { isActive: true };
      if (provider) {
        calendarQuery.provider = provider.toLowerCase();
      }
      if (userId) {
        calendarQuery.userId = userId;
      }
      if (leadId) {
        calendarQuery.leadId = leadId;
      }

      const calendarEvents = await this.calendarEventModel
        .find(calendarQuery)
        .exec();
      console.log(
        `Found ${calendarEvents.length} calendar events in local database`,
      );

      // Query for logged meetings
      const loggedMeetingsQuery: Record<string, unknown> = { isActive: true };
      if (leadId) {
        loggedMeetingsQuery.leadId = leadId;
      }

      const loggedMeetings = await this.loggedMeetingModel
        .find(loggedMeetingsQuery)
        .exec();
      console.log(
        `Found ${loggedMeetings.length} logged meetings in local database`,
      );

      // Get user profile for organizer name if Google Calendar and auth token provided
      let userProfile: { name?: string; email?: string } = {};
      if (calendarProvider === CalendarProvider.GOOGLE && authHeader) {
        try {
          const accessToken = authHeader.replace('Bearer ', '');
          userProfile =
            await this.googleCalendarService.getUserProfile(accessToken);
          console.log('Local events - User profile fetched:', userProfile);
        } catch (profileError) {
          console.warn(
            'Local events - Failed to get user profile:',
            profileError instanceof Error
              ? profileError.message
              : String(profileError),
          );
        }
      }

      // Map calendar events
      const mappedCalendarEvents = calendarEvents.map((event) => {
        // Determine organizer name with fallbacks
        let organizerName = event.organizerName;

        // If organizer name is missing and we have user profile, use it
        if (
          !organizerName &&
          userProfile.name &&
          event.organizer === userProfile.email
        ) {
          organizerName = userProfile.name;
        }

        // If still no organizer name, use email or fallback
        if (!organizerName) {
          organizerName = event.organizer || 'user';
        }

        console.log('event-------------------------:', event);
        return {
          id: event.externalId,
          title: event.title,
          startTime: event.startTime.toISOString(),
          endTime: event.endTime.toISOString(),
          meetingLink: event.meetingLink,
          attendees: event.attendees,
          location: event.locationDetails,
          organizer: event.organizer,
          organizerName: organizerName,
          description: event.description,
          isOnlineMeeting: event.isOnlineMeeting,
          onlineMeetingProvider: event.onlineMeetingProvider,
          leadId: event.leadId,
          outcome: event.outcome,
          timeZone: event.timeZone,
          source: 'calendar_event',
          isLoggedMeeting: false,
        };
      });

      // Map logged meetings
      const mappedLoggedMeetings = loggedMeetings.map((meeting) => {
        console.log('Meeting-------------------------:', meeting);
        return {
          id: meeting._id?.toString() || '', // Handle case where _id is undefined
          title: meeting.title,
          startTime: meeting.meetingDateTime.toISOString(),
          endTime: meeting.meetingDateTime.toISOString(), // Logged meetings have same start/end time
          meetingLink: null,
          attendees: meeting.participants,
          location: meeting.location,
          organizer: meeting.loggedBy,
          organizerName: meeting.loggedBy,
          description: meeting.summary,
          isOnlineMeeting: meeting.meetingType === MeetingType.VIRTUAL,
          onlineMeetingProvider: meeting.virtualMeetingProvider,
          leadId: meeting.leadId,
          outcome: meeting.outcome,
          timeZone: null,
          source: 'logged_meeting',
          loggedAt: new Date().toISOString(), // Use current date as fallback
          activityId: meeting.activityId,
          taskId: meeting.taskId,
          attachment: meeting.attachment,
          isLoggedMeeting: true,
          duration: meeting.duration,
        };
      });

      // Combine and sort all events by start time (newest first)
      const allEvents = [...mappedCalendarEvents, ...mappedLoggedMeetings].sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
      );

      return {
        success: true,
        data: allEvents,
      };
    } catch (error) {
      console.error('Failed to fetch local events:', error);
      throw new BadRequestException(
        `Failed to fetch local events: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Get('events/debug')
  @ApiOperation({ summary: 'Debug endpoint to test calendar events' })
  @ApiResponse({ status: 200 })
  @ApiHeader({ name: 'Authorization', description: 'Bearer token' })
  @ApiHeader({
    name: 'X-Calendar-Provider',
    description: 'Calendar provider (google or microsoft)',
    enum: CalendarProvider,
  })
  async debugEvents(
    @Headers('authorization') authHeader: string,
    @Headers('x-calendar-provider') provider: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    const { accessToken, provider: validatedProvider } = this.validateHeaders(
      authHeader,
      provider,
    );

    console.log('Debug endpoint called with:', {
      provider: validatedProvider,
      hasAccessToken: !!accessToken,
      startTime,
      endTime,
    });

    try {
      let result: CalendarResponse;
      switch (validatedProvider) {
        case CalendarProvider.GOOGLE:
          result = await this.googleCalendarService.getEvents(
            accessToken,
            startTime,
            endTime,
          );
          break;
        case CalendarProvider.MICROSOFT:
          result = await this.calenderSyncService.getEvents(
            accessToken,
            startTime,
            endTime,
          );
          break;
      }

      console.log('Debug endpoint result:', {
        success: result.success,
        eventCount: result.data?.length || 0,
        sampleEvent: result.data?.[0]
          ? {
              id: result.data[0].id,
              title: result.data[0].title,
              organizer: result.data[0].organizer,
              organizerName: result.data[0].organizerName,
            }
          : 'No events',
      });

      return {
        success: true,
        debug: {
          provider: validatedProvider,
          eventCount: result.data?.length || 0,
          sampleEvents: result.data?.slice(0, 3).map((event) => ({
            id: event.id,
            title: event.title,
            organizer: event.organizer,
            organizerName: event.organizerName,
            allFields: Object.keys(event),
          })),
        },
        data: result.data,
      };
    } catch (error) {
      console.error('Debug endpoint error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        debug: {
          provider: validatedProvider,
          hasAccessToken: !!accessToken,
        },
      };
    }
  }

  @Get('contacts')
  @ApiOperation({ summary: 'Get contacts from calendar provider' })
  @ApiResponse({ status: 200, type: ContactsResponse })
  @ApiHeader({ name: 'Authorization', description: 'Bearer token' })
  @ApiHeader({
    name: 'X-Calendar-Provider',
    description: 'Calendar provider (google or microsoft)',
    enum: CalendarProvider,
  })
  async getContacts(
    @Headers('authorization') authHeader: string,
    @Headers('x-calendar-provider') provider: string,
  ): Promise<ContactsResponse> {
    const { accessToken, provider: validatedProvider } = this.validateHeaders(
      authHeader,
      provider,
    );

    switch (validatedProvider) {
      case CalendarProvider.GOOGLE:
        return this.googleCalendarService.getContacts(
          accessToken,
        ) as unknown as Promise<ContactsResponse>;
      case CalendarProvider.MICROSOFT:
        return this.calenderSyncService.getContacts(
          accessToken,
        ) as unknown as Promise<ContactsResponse>;
    }
  }

  @Post('meetings/log')
  @ApiOperation({ summary: 'Log a meeting that has already taken place' })
  @ApiResponse({ status: 201, type: LogMeetingResponseDto })
  @ApiHeader({ name: 'X-Organization-ID', description: 'Organization ID' })
  async logMeeting(
    @Body() logMeetingDto: LogMeetingDto,
    @Headers('x-organization-id') organizationId: string,
  ): Promise<LogMeetingResponseDto> {
    try {
      // Validate required headers
      if (!organizationId) {
        throw new BadRequestException('X-Organization-ID header is required');
      }

      // Validate virtual meeting provider if meeting type is VIRTUAL
      if (
        logMeetingDto.meetingType === DtoMeetingType.VIRTUAL &&
        !logMeetingDto.virtualMeetingProvider
      ) {
        throw new BadRequestException(
          'Virtual meeting provider is required for virtual meetings',
        );
      }

      // Validate follow-up task if createFollowUpTask is true
      if (logMeetingDto.createFollowUpTask && !logMeetingDto.followUpTask) {
        throw new BadRequestException(
          'Follow-up task details are required when createFollowUpTask is true',
        );
      }
      console.log('logMeetingDto----------------', logMeetingDto);
      // Create logged meeting record
      const loggedMeeting = new this.loggedMeetingModel({
        title: logMeetingDto.title,
        duration: logMeetingDto.duration,
        location: logMeetingDto.location,
        meetingType: logMeetingDto.meetingType,
        virtualMeetingProvider: logMeetingDto.virtualMeetingProvider,
        meetingDateTime: new Date(logMeetingDto.meetingDateTime),
        summary: logMeetingDto.summary,
        outcome: logMeetingDto.outcome,
        participants: logMeetingDto.participants.map((p) => ({
          email: p.email,
          name: p.name,
          isExternal: p.isExternal || false,
        })),
        leadId: logMeetingDto.leadId,
        loggedBy: 'system',
        organizationId,
        attachment: logMeetingDto.attachment as string | undefined,
        metadata: {
          loggedAt: new Date(),
          source: 'manual_log',
        },
      });

      console.log('loggedMeeting----------------', loggedMeeting);

      const savedMeeting = await loggedMeeting.save();

      // Create activity record
      let activityId: string | undefined;
      const activityPayload = {
        leadId: logMeetingDto.leadId,
        activityType: ActivityType.CALENDAR_EVENT_CREATED,
        description: `Meeting logged: ${logMeetingDto.title}`,
        performedBy: 'system',
        metadata: {
          meetingId: savedMeeting._id?.toString(),
          meetingTitle: logMeetingDto.title,
          meetingType: logMeetingDto.meetingType,
          outcome: logMeetingDto.outcome,
          participants: logMeetingDto.participants.length,
        },
      };
      try {
        const activityResult =
          await this.activityClientService.logActivity(activityPayload);
        activityId = (
          activityResult as { _id?: { toString(): string } }
        )?._id?.toString();
      } catch (activityError) {
        console.error('Failed to create activity record:', activityError);
      }

      // Create follow-up task if requested
      let taskId: string | undefined;
      if (logMeetingDto.createFollowUpTask && logMeetingDto.followUpTask) {
        const taskPayload = {
          title: logMeetingDto.followUpTask.title,
          leadId: logMeetingDto.leadId,
          status: TaskStatus.PENDING,
          dueDate: logMeetingDto.followUpTask.dueDate,
          priority:
            (logMeetingDto.followUpTask.priority as TaskPriority) ||
            TaskPriority.MEDIUM,
          assignedTo: 'system',
          description: logMeetingDto.followUpTask.description,
          organizationId,
          createdBy: 'system',
        };
        const taskResult = (await this.taskClientService.createTask(
          taskPayload,
        )) as { id?: string };
        taskId = taskResult?.id;
      }

      // Update logged meeting with activity and task IDs
      if (activityId || taskId) {
        await this.loggedMeetingModel.findByIdAndUpdate(savedMeeting._id, {
          activityId,
          taskId,
        });
      }

      return {
        success: true,
        meetingId: savedMeeting._id?.toString() || '',
        activityId,
        taskId,
        message: 'Meeting logged successfully',
      };
    } catch (error) {
      console.error('Error logging meeting:', error);
      throw new BadRequestException(
        `Failed to log meeting: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Get('meetings/logged')
  @ApiOperation({ summary: 'Get logged meetings for a lead' })
  @ApiResponse({ status: 200 })
  @ApiQuery({ name: 'leadId', required: true })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getLoggedMeetings(
    @Query('leadId') leadId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    try {
      const skip = (page - 1) * limit;

      const meetings = await this.loggedMeetingModel
        .find({ leadId, isActive: true })
        .sort({ meetingDateTime: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      const total = await this.loggedMeetingModel
        .countDocuments({ leadId, isActive: true })
        .exec();

      return {
        success: true,
        data: meetings.map((meeting) => ({
          id: meeting._id?.toString(),
          title: meeting.title,
          meetingType: meeting.meetingType,
          virtualMeetingProvider: meeting.virtualMeetingProvider,
          meetingDateTime: meeting.meetingDateTime.toISOString(),
          summary: meeting.summary,
          outcome: meeting.outcome,
          participants: meeting.participants,
          loggedBy: meeting.loggedBy,
          loggedAt: new Date().toISOString(), // Use current date as fallback
          activityId: meeting.activityId,
          taskId: meeting.taskId,
          attachment: meeting.attachment,
          isLoggedMeeting: true,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching logged meetings:', error);
      throw new BadRequestException(
        `Failed to fetch logged meetings: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Get('meetings/logged/:meetingId')
  @ApiOperation({ summary: 'Get a specific logged meeting' })
  @ApiResponse({ status: 200 })
  @ApiParam({ name: 'meetingId', description: 'Logged meeting ID' })
  async getLoggedMeeting(@Param('meetingId') meetingId: string) {
    try {
      const meeting = await this.loggedMeetingModel.findById(meetingId).exec();

      if (!meeting) {
        throw new BadRequestException('Logged meeting not found');
      }

      return {
        success: true,
        data: {
          id: meeting._id?.toString(),
          title: meeting.title,
          meetingType: meeting.meetingType,
          virtualMeetingProvider: meeting.virtualMeetingProvider,
          meetingDateTime: meeting.meetingDateTime.toISOString(),
          summary: meeting.summary,
          outcome: meeting.outcome,
          participants: meeting.participants,
          loggedBy: meeting.loggedBy,
          loggedAt: new Date().toISOString(), // Use current date as fallback
          activityId: meeting.activityId,
          taskId: meeting.taskId,
          attachment: meeting.attachment,
          metadata: meeting.metadata,
          isLoggedMeeting: true,
        },
      };
    } catch (error) {
      console.error('Error fetching logged meeting:', error);
      throw new BadRequestException(
        `Failed to fetch logged meeting: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Post('meetings/upload-attachment')
  @ApiOperation({
    summary: 'Generate presigned URL for meeting attachment upload',
  })
  @ApiResponse({ status: 201 })
  async generateAttachmentUploadUrl(
    @Body() body: { fileName: string; contentType: string },
  ) {
    try {
      const key = `meetings/attachments/${Date.now()}-${body.fileName}`;

      const presignedUrl = await this.s3ClientService.generatePresignedUrl(
        key,
        body.contentType,
      );

      return {
        success: true,
        data: {
          uploadUrl: presignedUrl,
          key,
          fileName: body.fileName,
          contentType: body.contentType,
        },
      };
    } catch (error) {
      console.error('Error generating upload URL:', error);
      throw new BadRequestException(
        `Failed to generate upload URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Post('meetings/view-attachment')
  @ApiOperation({
    summary: 'Generate presigned URL for meeting attachment upload',
  })
  @ApiResponse({ status: 201 })
  async generateAttachmentViewUrl(
    @Body() body: { fileName: string; contentType: string },
  ) {
    try {
      const key = `meetings/attachments/${Date.now()}-${body.fileName}`;

      const presignedUrl = await this.s3ClientService.generateAccessUrl(key);

      return {
        success: true,
        data: {
          uploadUrl: presignedUrl,
          key,
        },
      };
    } catch (error) {
      console.error('Error generating upload URL:', error);
      throw new BadRequestException(
        `Failed to generate upload URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
