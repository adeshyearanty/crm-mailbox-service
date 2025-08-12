import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addMonths, differenceInMinutes, parseISO } from 'date-fns';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ActivityClientService } from '../client/activity-client.service';
import {
  CalendarResponse,
  DeleteEventResponse,
} from '../dto/calendar-response.dto';
import { CreateEventDto } from '../dto/create-event.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import { CalendarEvent } from '../schemas/calendar-event.schema';
import { ActivityType } from '../types/client-types';
import { MeetingLocationType } from '../types/meeting-location.type';

// Microsoft Graph API response types
interface MicrosoftGraphEvent {
  id: string;
  subject: string;
  body?: {
    content?: string;
    contentType?: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName?: string;
    locationType?: string;
    uniqueId?: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    status?: {
      response?: string;
    };
    type?: string;
  }>;
  organizer?: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  isAllDay?: boolean;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: string;
  onlineMeeting?: {
    joinUrl?: string;
  };
  recurrence?: {
    pattern?: {
      type?: string;
      interval?: number;
      month?: number;
      dayOfMonth?: number;
      daysOfWeek?: string[];
    };
    range?: {
      type?: string;
      startDate?: string;
      endDate?: string;
      numberOfOccurrences?: number;
    };
  };
}

interface MicrosoftGraphEventsResponse {
  value: MicrosoftGraphEvent[];
  '@odata.nextLink'?: string;
}

interface MicrosoftGraphError {
  code: string;
  message: string;
}

interface MicrosoftGraphErrorResponse {
  error?: MicrosoftGraphError;
}

interface MicrosoftGraphResponse {
  status?: number;
  data?: MicrosoftGraphErrorResponse;
}

interface MicrosoftGraphContact {
  id: string;
  displayName?: string;
  emailAddresses?: Array<{
    address: string;
    name?: string;
    type?: string;
  }>;
  businessPhones?: string[];
  mobilePhone?: string;
  jobTitle?: string;
  companyName?: string;
  department?: string;
  officeLocation?: string;
}

interface MicrosoftGraphContactsResponse {
  value: MicrosoftGraphContact[];
  '@odata.nextLink'?: string;
}

interface MicrosoftGraphUser {
  id: string;
  displayName?: string;
  emailAddresses?: Array<{
    address: string;
    name?: string;
    type?: string;
  }>;
  businessPhones?: string[];
  mobilePhone?: string;
  jobTitle?: string;
  companyName?: string;
  department?: string;
  officeLocation?: string;
}

interface MicrosoftGraphUsersResponse {
  value: MicrosoftGraphUser[];
  '@odata.nextLink'?: string;
}

interface ActivityPayload {
  leadId: string;
  activityType: ActivityType;
  description: string;
  performedBy: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MicrosoftService {
  private readonly graphApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    @InjectModel(CalendarEvent.name)
    private calendarEventModel: Model<CalendarEvent>,
    private readonly activityClientService: ActivityClientService,
  ) {
    this.graphApiUrl = 'https://graph.microsoft.com/v1.0/';
  }

  private async makeGraphApiCall<T = unknown>(
    accessToken: string,
    endpoint: string,
    method = 'GET',
    data?: unknown,
  ): Promise<T> {
    const response = await firstValueFrom(
      this.httpService
        .request({
          method,
          url: `${this.graphApiUrl}${endpoint}`,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          data,
        })
        .pipe(
          catchError((error: unknown) => {
            const errorObj = error as Record<string, unknown>;
            const response = errorObj?.response as
              | MicrosoftGraphResponse
              | undefined;

            console.error('Microsoft Graph API Error:', {
              status: response?.status,
              data: response?.data,
              message: errorObj?.message,
            });

            if (errorObj?.code === 'ECONNREFUSED') {
              throw new Error('Could not connect to Microsoft Graph API');
            }

            if (response?.data?.error) {
              const graphError = response.data.error;
              switch (graphError.code) {
                case 'InvalidAuthenticationToken':
                case 'AuthenticationFailed':
                  throw new UnauthorizedException('Authentication failed');
                case 'ErrorAccessDenied':
                  throw new UnauthorizedException('Access denied to calendar');
                case 'ResourceNotFound':
                  throw new BadRequestException('Calendar or event not found');
                case 'InvalidRequest':
                  throw new BadRequestException(
                    graphError.message || 'Invalid request to calendar API',
                  );
                default:
                  if (response?.status === 401) {
                    throw new UnauthorizedException(
                      'Microsoft Graph access not authorized or token expired',
                    );
                  }
                  if (response?.status === 403) {
                    throw new UnauthorizedException(
                      'Insufficient permissions to access calendar',
                    );
                  }
                  throw new BadRequestException(
                    graphError.message || 'Microsoft Graph API error',
                  );
              }
            }

            throw error;
          }),
        ),
    );

    return response.data as T;
  }

  private validateTimeLogic(startTime: string, endTime: string) {
    const start = parseISO(startTime);
    const end = parseISO(endTime);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        'Invalid date format. Please use ISO 8601 format.',
      );
    }

    if (start < now) {
      throw new BadRequestException('Start time cannot be in the past');
    }

    if (end <= start) {
      throw new BadRequestException('End time must be after start time');
    }

    const durationInMinutes = differenceInMinutes(end, start);
    if (durationInMinutes > 24 * 60) {
      throw new BadRequestException('Event duration cannot exceed 24 hours');
    }
  }

  private async validateCalendarAccess(accessToken: string): Promise<void> {
    try {
      await this.makeGraphApiCall(accessToken, 'me/calendar', 'GET');
    } catch {
      throw new UnauthorizedException({
        message:
          'Calendar access not authorized. Please connect and authorize your calendar.',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }
  }

  async getEvents(
    accessToken: string,
    startTime?: string,
    endTime?: string,
  ): Promise<CalendarResponse> {
    try {
      await this.validateCalendarAccess(accessToken);

      const now = new Date();
      const start = startTime ? parseISO(startTime) : now;
      const end = endTime ? parseISO(endTime) : addMonths(now, 1);

      const queryParams = new URLSearchParams({
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
      });

      const events = await this.makeGraphApiCall<MicrosoftGraphEventsResponse>(
        accessToken,
        `me/calendarView?${queryParams}&$select=id,subject,start,end,location,attendees,body,isAllDay,recurrence`,
      );

      console.log('Microsoft Calendar - Successfully fetched events:', {
        count: events.value?.length,
      });

      return {
        success: true,
        data: events.value.map((event) => ({
          id: event.id,
          title: event.subject,
          startTime: event.start.dateTime,
          endTime: event.end.dateTime,
          allDay: event.isAllDay,
          location: event.location?.displayName,
          attendees:
            event.attendees?.map((attendee) => ({
              email: attendee.emailAddress.address,
              name: attendee.emailAddress.name,
              status: attendee.status?.response || 'none',
            })) || [],
          description: event.body?.content,
          organizer: event.organizer?.emailAddress.address as string,
          isOnlineMeeting: event.isOnlineMeeting,
          onlineMeetingProvider: event.onlineMeetingProvider,
          leadId: '', // Microsoft events don't have leadId, will be set when saved to DB
        })),
      };
    } catch (error: unknown) {
      const errorObj = error as Record<string, unknown>;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const responseData = errorObj?.response as
        | Record<string, unknown>
        | undefined;

      console.error('Microsoft Calendar - Error fetching events:', {
        error: errorMessage,
        stack: errorStack,
        response: responseData?.data,
      });
      throw new BadRequestException(
        `Failed to fetch calendar events: ${errorMessage}`,
      );
    }
  }

  async createEvent(
    accessToken: string,
    eventData: CreateEventDto,
  ): Promise<CalendarResponse> {
    try {
      await this.validateCalendarAccess(accessToken);
      this.validateTimeLogic(eventData.startTime, eventData.endTime);
      const meetingLink = this.getMeetingLink(eventData.locationType);

      const attendees = eventData.attendees.map((attendee) => ({
        emailAddress: {
          address: attendee.email,
          name: attendee.name || attendee.email.split('@')[0],
        },
        type:
          attendee.responseRequired === true ||
          attendee.responseRequired === 'REQUIRED'
            ? 'required'
            : 'optional',
      }));

      const graphEvent = {
        subject: eventData.title,
        body: {
          contentType: 'HTML',
          content: eventData.description || '',
        },
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'UTC',
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'UTC',
        },
        attendees: attendees,
        isAllDay: eventData.isAllDay || false,
        organizer: {
          emailAddress: {
            address: eventData.organizer,
          },
        },
      };

      if (eventData.locationType === MeetingLocationType.IN_PERSON) {
        graphEvent['location'] = {
          displayName: eventData.locationDetails || 'In Person Meeting',
        };
      } else if (eventData.locationType === MeetingLocationType.TEAMS) {
        graphEvent['isOnlineMeeting'] = true;
        graphEvent['onlineMeetingProvider'] = 'teamsForBusiness';
      } else {
        // For other online types, set as needed, or fallback
        graphEvent['isOnlineMeeting'] = true;
        graphEvent['onlineMeetingProvider'] = 'teamsForBusiness';
      }

      const createdEvent = await this.makeGraphApiCall<MicrosoftGraphEvent>(
        accessToken,
        'me/events',
        'POST',
        graphEvent,
      );

      // Save to MongoDB
      const calendarEvent = new this.calendarEventModel({
        externalId: createdEvent.id,
        provider: 'microsoft',
        userId: createdEvent.organizer?.emailAddress.address,
        leadId: eventData.leadId,
        title: createdEvent.subject,
        description: createdEvent.body?.content,
        startTime: new Date(
          eventData.startTime.includes('Z') ||
          eventData.startTime.match(/[+-][0-9]{2}:[0-9]{2}$/)
            ? eventData.startTime
            : eventData.startTime + 'Z',
        ),
        endTime: new Date(
          eventData.endTime.includes('Z') ||
          eventData.endTime.match(/[+-][0-9]{2}:[0-9]{2}$/)
            ? eventData.endTime
            : eventData.endTime + 'Z',
        ),
        timeZone: createdEvent.start.timeZone,
        isAllDay: createdEvent.isAllDay,
        locationType: eventData.locationType,
        locationDetails: createdEvent.location?.displayName,
        attendees: createdEvent.attendees?.map((a) => ({
          email: a.emailAddress.address,
          name: a.emailAddress.name,
          status: a.status?.response || 'none',
        })),
        organizer: createdEvent.organizer?.emailAddress.address,
        organizerName: createdEvent.organizer?.emailAddress.name,
        meetingLink: createdEvent.onlineMeeting?.joinUrl || meetingLink,
        isOnlineMeeting: createdEvent.isOnlineMeeting,
        onlineMeetingProvider: createdEvent.onlineMeetingProvider,
        outcome: eventData.outcome,
      });

      console.log('Saving calendar event to MongoDB:', {
        eventId: createdEvent.id,
        title: createdEvent.subject,
        organizer: createdEvent.organizer?.emailAddress.address,
      });

      try {
        const savedEvent = await calendarEvent.save();
        console.log('Successfully saved calendar event to MongoDB:', {
          id: savedEvent._id,
          externalId: savedEvent.externalId,
          title: savedEvent.title,
        });

        // Log calendar event creation activity
        try {
          if (eventData.leadId) {
            const activityPayload: ActivityPayload = {
              leadId: eventData.leadId,
              activityType: ActivityType.CALENDAR_EVENT_CREATED,
              description: `Calendar event '${createdEvent.subject}' created by ${createdEvent.organizer?.emailAddress.name || createdEvent.organizer?.emailAddress.address}`,
              performedBy: createdEvent.organizer?.emailAddress
                .address as string,
              metadata: {
                eventTitle: createdEvent.subject,
                eventStartTime: createdEvent.start.dateTime,
                eventEndTime: createdEvent.end.dateTime,
                eventLocation: createdEvent.location?.displayName,
                eventProvider: 'microsoft',
                eventId: createdEvent.id,
                leadId: eventData.leadId,
                attendees: createdEvent.attendees?.length || 0,
                isOnlineMeeting: createdEvent.isOnlineMeeting,
                meetingLink: createdEvent.onlineMeeting?.joinUrl,
              },
            };
            await this.activityClientService.logActivity(activityPayload);
            console.log(
              'Microsoft Calendar - Activity logged successfully for event creation',
            );
          } else {
            console.warn(
              'Microsoft Calendar - No leadId provided, skipping activity logging',
            );
          }
        } catch (activityError: unknown) {
          const errorMessage =
            activityError instanceof Error
              ? activityError.message
              : String(activityError);
          const errorStack =
            activityError instanceof Error ? activityError.stack : undefined;

          console.error('Failed to log calendar event activity:', {
            error: errorMessage,
            stack: errorStack,
            leadId: eventData.leadId,
            eventId: createdEvent.id,
          });
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error('Failed to save calendar event to MongoDB:', {
          error: errorMessage,
          eventData: {
            externalId: createdEvent.id,
            title: createdEvent.subject,
          },
        });
        throw new BadRequestException(
          `Failed to save calendar event: ${errorMessage}`,
        );
      }

      return {
        success: true,
        data: [
          {
            id: createdEvent.id,
            title: createdEvent.subject,
            startTime: createdEvent.start.dateTime,
            endTime: createdEvent.end.dateTime,
            meetingLink: createdEvent.onlineMeeting?.joinUrl || meetingLink,
            attendees:
              createdEvent.attendees?.map((a) => ({
                email: a.emailAddress.address,
                name: a.emailAddress.name,
                status: a.status?.response || 'none',
              })) || [],
            location: createdEvent.location?.displayName,
            organizer: createdEvent.organizer?.emailAddress.address as string,
            organizerName: createdEvent.organizer?.emailAddress.name,
            description: createdEvent.body?.content,
            isOnlineMeeting: createdEvent.isOnlineMeeting,
            onlineMeetingProvider: createdEvent.onlineMeetingProvider,
            leadId: eventData.leadId,
            outcome: eventData.outcome,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Create Event Error:', {
        error: errorMessage,
        eventData: eventData,
      });
      throw new BadRequestException(
        `Failed to create calendar event: ${errorMessage}`,
      );
    }
  }

  async deleteEvent(
    accessToken: string,
    eventId: string,
  ): Promise<DeleteEventResponse> {
    try {
      if (accessToken && accessToken.trim() !== '') {
        try {
          await this.makeGraphApiCall(
            accessToken,
            `me/events/${eventId}`,
            'DELETE',
          );
        } catch (externalError: unknown) {
          const errorMessage =
            externalError instanceof Error
              ? externalError.message
              : String(externalError);
          console.warn(
            `Failed to delete event from external calendar: ${errorMessage}`,
          );
        }
      }

      await this.calendarEventModel.findOneAndUpdate(
        { externalId: eventId },
        { isActive: false },
      );

      let eventDetails: CalendarEvent | null = null;
      try {
        eventDetails = await this.calendarEventModel.findOne({
          externalId: eventId,
        });
        if (eventDetails && eventDetails.leadId) {
          const activityPayload: ActivityPayload = {
            leadId: eventDetails.leadId,
            activityType: ActivityType.CALENDAR_EVENT_DELETED,
            description: `Calendar event '${eventDetails.title}' deleted by user`,
            performedBy: 'system', // performedBy - you may need to get this from context
            metadata: {
              eventTitle: eventDetails.title,
              eventStartTime: eventDetails.startTime,
              eventEndTime: eventDetails.endTime,
              eventLocation: eventDetails.locationDetails,
              eventProvider: 'microsoft',
              eventId: eventId,
              leadId: eventDetails.leadId,
              attendees: eventDetails.attendees?.length || 0,
              isOnlineMeeting: eventDetails.isOnlineMeeting,
              meetingLink: eventDetails.meetingLink,
            },
          };
          await this.activityClientService.logActivity(activityPayload);
          console.log(
            'Microsoft Calendar - Activity logged successfully for event deletion',
          );
        } else if (eventDetails) {
          console.warn(
            'Microsoft Calendar - Event found but no leadId, skipping activity logging',
          );
        } else {
          console.warn(
            'Microsoft Calendar - Event not found in database, skipping activity logging',
          );
        }
      } catch (activityError: unknown) {
        const errorMessage =
          activityError instanceof Error
            ? activityError.message
            : String(activityError);
        const errorStack =
          activityError instanceof Error ? activityError.stack : undefined;

        console.error('Failed to log calendar event activity:', {
          error: errorMessage,
          stack: errorStack,
          leadId: eventDetails?.leadId,
          eventId: eventId,
        });
      }

      return {
        success: true,
        data: {
          message: 'Event deleted successfully',
          eventId,
        },
        statusCode: 200,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Failed to delete calendar event: ${errorMessage}`,
      );
    }
  }

  async updateEvent(
    accessToken: string,
    eventId: string,
    eventData: UpdateEventDto,
  ): Promise<CalendarResponse> {
    await this.validateCalendarAccess(accessToken);

    try {
      const existingEvent = await this.makeGraphApiCall<MicrosoftGraphEvent>(
        accessToken,
        `me/events/${eventId}`,
        'GET',
      );

      if (eventData.startTime && eventData.endTime) {
        this.validateTimeLogic(eventData.startTime, eventData.endTime);
      }

      const updatePayload: Partial<MicrosoftGraphEvent> = {};

      if (eventData.title) updatePayload.subject = eventData.title;
      if (eventData.description) {
        updatePayload.body = {
          contentType: 'HTML',
          content: eventData.description,
        };
      }

      if (eventData.startTime) {
        updatePayload.start = {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || existingEvent.start.timeZone || 'UTC',
        };

        if (!eventData.endTime) {
          const existingStart = new Date(existingEvent.start.dateTime);
          const existingEnd = new Date(existingEvent.end.dateTime);
          const duration = existingEnd.getTime() - existingStart.getTime();
          const newStart = new Date(eventData.startTime);
          const newEnd = new Date(newStart.getTime() + duration);

          updatePayload.end = {
            dateTime: newEnd.toISOString(),
            timeZone: eventData.timeZone || existingEvent.end.timeZone || 'UTC',
          };
        }
      }

      if (eventData.endTime) {
        updatePayload.end = {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || existingEvent.end.timeZone || 'UTC',
        };

        if (!eventData.startTime) {
          updatePayload.start = {
            dateTime: existingEvent.start.dateTime,
            timeZone:
              eventData.timeZone || existingEvent.start.timeZone || 'UTC',
          };
        }
      }

      if (eventData.locationDetails) {
        updatePayload.location = {
          displayName: eventData.locationDetails,
        };
      }
      if (eventData.attendees) {
        updatePayload.attendees = eventData.attendees.map((attendee) => ({
          emailAddress: {
            address: attendee.email,
            name: attendee.name || attendee.email.split('@')[0],
          },
          status: {
            response: 'notResponded',
          },
          type: 'required',
        }));
      }

      if (eventData.locationType) {
        if (eventData.locationType === MeetingLocationType.IN_PERSON) {
          updatePayload.isOnlineMeeting = false;
          updatePayload.onlineMeetingProvider = undefined;
        } else if (eventData.locationType === MeetingLocationType.TEAMS) {
          updatePayload.isOnlineMeeting = true;
          updatePayload.onlineMeetingProvider = 'teamsForBusiness';
        } else {
          updatePayload.isOnlineMeeting = true;
          updatePayload.onlineMeetingProvider = 'teamsForBusiness';
        }
      }
      if (eventData.isAllDay !== undefined) {
        updatePayload.isAllDay = eventData.isAllDay;
      }

      console.log('Microsoft Calendar - Update payload:', updatePayload);

      const updatedEvent = await this.makeGraphApiCall<MicrosoftGraphEvent>(
        accessToken,
        `me/events/${eventId}`,
        'PATCH',
        updatePayload,
      );

      const updateData: Partial<CalendarEvent> = {};
      if (eventData.title) updateData.title = updatedEvent.subject;
      if (eventData.description)
        updateData.description = updatedEvent.body?.content;
      if (eventData.startTime)
        updateData.startTime = new Date(
          eventData.startTime.includes('Z') ||
          eventData.startTime.match(/[+-][0-9]{2}:[0-9]{2}$/)
            ? eventData.startTime
            : eventData.startTime + 'Z',
        );
      if (eventData.endTime)
        updateData.endTime = new Date(
          eventData.endTime.includes('Z') ||
          eventData.endTime.match(/[+-][0-9]{2}:[0-9]{2}$/)
            ? eventData.endTime
            : eventData.endTime + 'Z',
        );
      if (eventData.timeZone) updateData.timeZone = updatedEvent.start.timeZone;
      if (eventData.isAllDay !== undefined)
        updateData.isAllDay = updatedEvent.isAllDay;
      if (eventData.locationType)
        updateData.locationType = eventData.locationType;
      if (eventData.locationDetails)
        updateData.locationDetails = updatedEvent.location?.displayName;
      if (eventData.leadId) updateData.leadId = eventData.leadId;
      if (eventData.attendees) {
        updateData.attendees =
          updatedEvent.attendees?.map((a) => ({
            email: a.emailAddress.address,
            name: a.emailAddress.name,
            status: a.status?.response || 'none',
          })) || [];
      }
      if (eventData.organizer)
        updateData.organizer = updatedEvent.organizer?.emailAddress.address;
      if (updatedEvent.onlineMeeting?.joinUrl)
        updateData.meetingLink = updatedEvent.onlineMeeting.joinUrl;
      if (updatedEvent.isOnlineMeeting !== undefined)
        updateData.isOnlineMeeting = updatedEvent.isOnlineMeeting;
      if (updatedEvent.onlineMeetingProvider)
        updateData.onlineMeetingProvider = updatedEvent.onlineMeetingProvider;
      if (eventData.outcome) updateData.outcome = eventData.outcome;
      if (eventData.organizerName)
        updateData.organizerName = updatedEvent.organizer?.emailAddress.name;

      if (Object.keys(updateData).length > 0) {
        await this.calendarEventModel.findOneAndUpdate(
          { externalId: eventId },
          updateData,
        );
      }

      let leadId = eventData.leadId;
      if (!leadId) {
        const existingEvent = await this.calendarEventModel.findOne({
          externalId: eventId,
        });
        leadId = existingEvent?.leadId;
      }

      if (leadId) {
        const activityPayload: ActivityPayload = {
          leadId: leadId,
          activityType: ActivityType.CALENDAR_EVENT_UPDATED,
          description: `Calendar event '${updatedEvent.subject}' updated by ${updatedEvent.organizer?.emailAddress.name || updatedEvent.organizer?.emailAddress.address || 'user'}`,
          performedBy: updatedEvent.organizer?.emailAddress.address || 'system',
          metadata: {
            eventTitle: updatedEvent.subject,
            eventStartTime: updatedEvent.start.dateTime,
            eventEndTime: updatedEvent.end.dateTime,
            eventLocation: updatedEvent.location?.displayName,
            eventProvider: 'microsoft',
            eventId: updatedEvent.id,
            leadId: leadId,
            attendees: updatedEvent.attendees?.length || 0,
            isOnlineMeeting: updatedEvent.isOnlineMeeting,
            meetingLink: updatedEvent.onlineMeeting?.joinUrl,
            updatedFields: Object.keys(eventData),
          },
        };
        await this.activityClientService.logActivity(activityPayload);
      }

      return {
        success: true,
        data: [
          {
            id: updatedEvent.id,
            title: updatedEvent.subject,
            startTime: updatedEvent.start.dateTime,
            endTime: updatedEvent.end.dateTime,
            location: updatedEvent.location?.displayName,
            attendees:
              updatedEvent.attendees?.map((a) => ({
                email: a.emailAddress.address,
                name: a.emailAddress.name,
                status: a.status?.response || 'none',
              })) || [],
            organizer: updatedEvent.organizer?.emailAddress.address || 'system',
            organizerName: updatedEvent.organizer?.emailAddress.name,
            description: updatedEvent.body?.content,
            isOnlineMeeting: updatedEvent.isOnlineMeeting,
            onlineMeetingProvider: updatedEvent.onlineMeetingProvider,
            leadId: eventData.leadId || '',
          },
        ],
      };
    } catch (activityError: unknown) {
      const errorMessage =
        activityError instanceof Error
          ? activityError.message
          : String(activityError);
      const errorStack =
        activityError instanceof Error ? activityError.stack : undefined;

      console.error('Failed to log calendar event activity:', {
        error: errorMessage,
        stack: errorStack,
        leadId: eventData.leadId,
        eventId: eventId,
      });

      throw new BadRequestException(
        `Failed to update calendar event: ${errorMessage}`,
      );
    }
  }
  catch(error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(
      `Failed to update calendar event: ${errorMessage}`,
    );
  }

  private getMeetingLink(
    locationType: MeetingLocationType,
  ): string | undefined {
    if (locationType === MeetingLocationType.TEAMS) {
      return undefined;
    }
    return undefined;
  }

  async getContacts(accessToken: string): Promise<any> {
    try {
      await this.validateCalendarAccess(accessToken);

      const contacts =
        await this.makeGraphApiCall<MicrosoftGraphContactsResponse>(
          accessToken,
          'me/contacts',
          'GET',
        );

      const people = await this.makeGraphApiCall<MicrosoftGraphUsersResponse>(
        accessToken,
        'me/people',
        'GET',
      );

      const formattedContacts =
        contacts.value?.map((contact) => ({
          id: contact.id,
          displayName: contact.displayName,
          emailAddresses:
            contact.emailAddresses?.map((email) => ({
              address: email.address,
              name: email.name,
              type: email.type,
            })) || [],
          businessPhones: contact.businessPhones || [],
          mobilePhone: contact.mobilePhone,
          jobTitle: contact.jobTitle,
          companyName: contact.companyName,
          department: contact.department,
          officeLocation: contact.officeLocation,
          source: 'contacts',
        })) || [];

      const formattedPeople =
        people.value?.map((person) => ({
          id: person.id,
          displayName: person.displayName,
          emailAddresses:
            person.emailAddresses?.map((email) => ({
              address: email.address,
              name: email.name,
              type: email.type,
            })) || [],
          businessPhones: person.businessPhones || [],
          mobilePhone: person.mobilePhone,
          jobTitle: person.jobTitle,
          companyName: person.companyName,
          department: person.department,
          officeLocation: person.officeLocation,
          source: 'people',
        })) || [];

      const allContacts = [...formattedContacts, ...formattedPeople];
      const uniqueContacts = this.removeDuplicateContacts(allContacts);

      return {
        success: true,
        data: {
          contacts: uniqueContacts,
          totalCount: uniqueContacts.length,
          source: 'microsoft',
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Failed to fetch Microsoft contacts:', error);
      throw new BadRequestException(
        `Failed to fetch contacts: ${errorMessage}`,
      );
    }
  }

  private removeDuplicateContacts(contacts: any[]): any[] {
    const emailMap = new Map();

    contacts.forEach((contact: { emailAddresses: { address: string }[] }) => {
      contact.emailAddresses?.forEach((email) => {
        const emailKey = email.address.toLowerCase();
        if (!emailMap.has(emailKey)) {
          emailMap.set(emailKey, contact);
        }
      });
    });

    return Array.from(emailMap.values());
  }
}
