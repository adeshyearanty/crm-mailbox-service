import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  addMonths,
  differenceInMinutes,
  endOfDay,
  format,
  parseISO,
  startOfDay,
} from 'date-fns';
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

// Google Calendar API response types
interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone: string;
  };
  location?: string;
  locationDetails?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    name?: string;
    responseStatus?: string;
  }>;
  organizer?: {
    email: string;
    displayName?: string;
    name?: string;
  };
  hangoutLink?: string;
  conferenceData?: {
    createRequest?: {
      requestId: string;
      conferenceSolutionKey: { type: string };
    };
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
    }>;
  };
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: string;
  outcome?: string;
  leadId?: string;
}

interface GoogleCalendarEventsResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

interface GoogleUserProfile {
  name?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
}

interface GoogleContactGroupsResponse {
  contactGroups?: Array<{
    resourceName: string;
    memberResourceNames?: string[];
  }>;
}

interface GooglePeopleResponse {
  people?: Array<{
    resourceName: string;
    names?: Array<{
      displayName?: string;
      givenName?: string;
      familyName?: string;
    }>;
    emailAddresses?: Array<{
      value: string;
      displayName?: string;
      type?: string;
    }>;
    phoneNumbers?: Array<{
      value: string;
      type?: string;
    }>;
    organizations?: Array<{
      name?: string;
      title?: string;
    }>;
  }>;
}

interface GoogleApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
  };
}

interface GoogleApiResponse {
  status?: number;
  statusText?: string;
  data?: GoogleApiErrorResponse;
  url?: string;
}

interface HttpErrorResponse {
  response?: {
    status?: number;
    data?: GoogleApiErrorResponse;
  };
  message?: string;
  stack?: string;
  code?: string;
}

// Contact types
interface Contact {
  resourceName: string;
  names?: Array<{
    displayName?: string;
    givenName?: string;
    familyName?: string;
  }>;
  emailAddresses?: Array<{
    value: string;
    displayName?: string;
    type?: string;
  }>;
  phoneNumbers?: Array<{
    value: string;
    type?: string;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
  }>;
}

interface ContactWithDetails {
  id: string;
  name: string;
  email: string;
  phone?: string;
  organization?: string;
  title?: string;
}

// Event details type for activity logging
interface EventDetails {
  _id?: string;
  leadId?: string;
  title?: string;
  startTime?: Date;
  endTime?: Date;
  locationDetails?: string;
  attendees?: Array<{
    email: string;
    name?: string;
    status?: string;
  }>;
  isOnlineMeeting?: boolean;
  meetingLink?: string;
}

// Activity payload type
interface ActivityPayload {
  leadId: string;
  activityType: ActivityType;
  description: string;
  performedBy: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class GoogleCalendarService {
  private readonly googleApiUrl = 'https://www.googleapis.com/calendar/v3';

  constructor(
    private readonly httpService: HttpService,
    @InjectModel(CalendarEvent.name)
    private calendarEventModel: Model<CalendarEvent>,
    private readonly activityClientService: ActivityClientService,
  ) {}

  private async makeGoogleApiCall<T = unknown>(
    accessToken: string,
    endpoint: string,
    method = 'GET',
    data?: unknown,
    baseUrl?: string,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .request({
            method,
            url: `${baseUrl || this.googleApiUrl}${endpoint}`,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            data,
          })
          .pipe(
            catchError((error: unknown) => {
              const errorObj = error as HttpErrorResponse;
              const response = errorObj?.response as
                | GoogleApiResponse
                | undefined;

              console.error('Google Calendar API Error:', {
                status: response?.status,
                statusText: response?.statusText,
                data: response?.data,
                url: response?.url,
              });

              // Handle Google API specific errors
              if (response?.data?.error) {
                const googleError = response.data.error;

                switch (googleError.code) {
                  case 401:
                    throw new UnauthorizedException(
                      `Google Calendar API authentication failed: ${googleError.message || 'Invalid access token'}`,
                    );
                  case 403:
                    throw new UnauthorizedException(
                      `Google Calendar API permission denied: ${googleError.message || 'Insufficient permissions'}`,
                    );
                  case 404:
                    throw new BadRequestException(
                      `Google Calendar API resource not found: ${googleError.message || 'Resource does not exist'}`,
                    );
                  case 429:
                    throw new BadRequestException(
                      `Google Calendar API rate limit exceeded: ${googleError.message || 'Too many requests'}`,
                    );
                  default:
                    throw new BadRequestException(
                      `Google Calendar API error: ${googleError.message || 'Unknown error occurred'}`,
                    );
                }
              }

              // Handle HTTP errors
              if (response?.status) {
                const errorMessage =
                  response?.data?.error?.message ||
                  response?.statusText ||
                  'Unknown error';
                throw new BadRequestException(
                  `Google Calendar API HTTP error ${response.status}: ${errorMessage}`,
                );
              }

              // Handle network or other errors
              const errorMessage =
                errorObj?.message || 'Network error occurred';
              throw new BadRequestException(
                `Google Calendar API error: ${errorMessage}`,
              );
            }),
          ),
      );

      return response.data as T;
    } catch (error) {
      // Re-throw if it's already a NestJS exception
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Handle unexpected errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Google Calendar API unexpected error: ${errorMessage}`,
      );
    }
  }

  private validateTimeLogic(startTime: string, endTime: string) {
    const start = parseISO(startTime);
    const end = parseISO(endTime);

    if (start >= end) {
      throw new BadRequestException('Start time must be before end time');
    }

    const durationInMinutes = differenceInMinutes(end, start);
    if (durationInMinutes > 1440) {
      throw new BadRequestException('Event duration cannot exceed 24 hours');
    }
  }

  async getEvents(
    accessToken: string,
    startTime?: string,
    endTime?: string,
  ): Promise<CalendarResponse> {
    try {
      console.log('Google Calendar - Getting events with params:', {
        startTime,
        endTime,
        hasAccessToken: !!accessToken,
      });

      // If no dates provided, get events for next 3 months
      const now = new Date();
      const defaultStartTime =
        startTime || format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss'Z'");
      const defaultEndTime =
        endTime ||
        format(endOfDay(addMonths(now, 3)), "yyyy-MM-dd'T'HH:mm:ss'Z'");

      const queryParams = `timeMin=${encodeURIComponent(defaultStartTime)}&timeMax=${encodeURIComponent(defaultEndTime)}`;
      console.log(
        'Google Calendar - Making API call with params:',
        queryParams,
      );

      const events = await this.makeGoogleApiCall<GoogleCalendarEventsResponse>(
        accessToken,
        `/calendars/primary/events?${queryParams}`,
      );

      if (!events || !events.items) {
        console.error('Google Calendar - Invalid response format:', events);
        throw new Error('Invalid response format from Google Calendar API');
      }

      // Debug: Log raw API response structure
      console.log('Google Calendar - Raw API response structure:', {
        hasItems: !!events.items,
        itemCount: events.items?.length || 0,
        responseKeys: Object.keys(events),
        sampleItemKeys: events.items?.[0]
          ? Object.keys(events.items[0])
          : 'No items',
      });

      console.log('Google Calendar - Successfully fetched events:', {
        count: events.items.length,
      });

      // Debug: Log organizer info for first few events
      if (events.items.length > 0) {
        console.log('Google Calendar - Sample event organizer info:');
        events.items.slice(0, 3).forEach((event, index) => {
          console.log(`Event ${index + 1}:`, {
            id: event.id,
            title: event.summary,
            organizer: event.organizer,
            organizerFields: event.organizer
              ? Object.keys(event.organizer)
              : 'No organizer',
            displayName: event.organizer?.displayName,
            email: event.organizer?.email,
            name: event.organizer?.name,
          });
        });
      }

      // Get user profile for organizer name
      let userProfile: { name?: string; email?: string } = {};
      try {
        userProfile = await this.getUserProfile(accessToken);
        console.log('Google Calendar - User profile fetched:', userProfile);
      } catch (profileError: unknown) {
        const errorMessage =
          profileError instanceof Error
            ? profileError.message
            : String(profileError);
        console.warn(
          'Google Calendar - Failed to fetch user profile:',
          errorMessage,
        );
      }

      const mappedEvents = events.items.map((event: GoogleCalendarEvent) => {
        const startTime = event.start.dateTime || event.start.date;
        const endTime = event.end.dateTime || event.end.date;

        return {
          id: event.id,
          title: event.summary,
          startTime: startTime || '',
          endTime: endTime || '',
          allDay: !event.start.dateTime,
          location: event.locationDetails || event.location,
          attendees:
            event.attendees?.map((attendee) => ({
              email: attendee.email,
              name: attendee.name || attendee.displayName,
              status: attendee.responseStatus,
            })) || [],
          organizer: event.organizer?.email || '',
          organizerName:
            event.organizer?.name || event.organizer?.displayName || '',
          description: event.description,
          meetingLink: event.hangoutLink,
          isOnlineMeeting: !!event.conferenceData,
          onlineMeetingProvider: event.onlineMeetingProvider,
          leadId: event.leadId || '',
          outcome: event.outcome,
        };
      });

      // Debug: Log the mapped events to see what's being returned
      console.log('Google Calendar - Mapped events with organizer info:');
      mappedEvents.slice(0, 3).forEach((event, index) => {
        console.log(`Mapped Event ${index + 1}:`, {
          id: event.id,
          title: event.title,
          organizer: event.organizer,
          organizerName: event.organizerName,
        });
      });

      return {
        success: true,
        data: mappedEvents,
      };
    } catch (error: unknown) {
      const errorObj = error as HttpErrorResponse;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const responseData = errorObj?.response?.data;

      console.error('Google Calendar - Error fetching events:', {
        error: errorMessage,
        response: responseData,
        startTime,
        endTime,
      });

      // If it's an HTTP exception, rethrow it
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      // Handle specific error cases
      if (
        errorObj?.response?.status === 401 ||
        errorObj?.response?.status === 403
      ) {
        throw new UnauthorizedException(
          'Google Calendar access not authorized or token expired',
        );
      }

      if (errorObj?.code === 'ETIMEDOUT' || errorObj?.code === 'ECONNREFUSED') {
        throw new BadRequestException(
          'Could not connect to Google Calendar API',
        );
      }

      // For other errors, throw a BadRequestException with the error message
      throw new BadRequestException(
        errorMessage || 'Failed to fetch calendar events',
      );
    }
  }

  async createEvent(
    accessToken: string,
    eventData: CreateEventDto,
  ): Promise<CalendarResponse> {
    try {
      console.log('Google Calendar - Creating event:', {
        title: eventData.title,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        timeZone: eventData.timeZone,
        hasAccessToken: !!accessToken,
      });

      if (!accessToken) {
        throw new UnauthorizedException('Access token is required');
      }

      this.validateTimeLogic(eventData.startTime, eventData.endTime);

      const googleEvent = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'UTC',
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'UTC',
        },
        attendees:
          eventData.attendees?.map((attendee) => ({
            email: attendee.email,
            displayName: attendee.name || undefined,
            responseStatus:
              attendee.responseRequired === true ||
              attendee.responseRequired === 'REQUIRED'
                ? 'accepted'
                : 'needsAction',
          })) || [],
        location:
          eventData.locationType === MeetingLocationType.IN_PERSON
            ? eventData.locationDetails
            : undefined,
        conferenceData:
          eventData.locationType === MeetingLocationType.GOOGLE_MEET
            ? {
                createRequest: {
                  requestId: Math.random().toString(36).substring(7),
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              }
            : undefined,
      };

      console.log('Google Calendar - Making API call to create event');

      const createdEvent = await this.makeGoogleApiCall<GoogleCalendarEvent>(
        accessToken,
        '/calendars/primary/events?conferenceDataVersion=1',
        'POST',
        googleEvent,
      );

      if (!createdEvent) {
        throw new BadRequestException(
          'Failed to create event: No response from Google Calendar API',
        );
      }

      // Get user profile for organizer name
      let userProfile: { name?: string; email?: string } = {};
      try {
        userProfile = await this.getUserProfile(accessToken);
        console.log(
          'Google Calendar - User profile for event creation:',
          userProfile,
        );
      } catch (profileError: unknown) {
        const errorMessage =
          profileError instanceof Error
            ? profileError.message
            : String(profileError);
        console.warn(
          'Google Calendar - Failed to get user profile for event creation:',
          errorMessage,
        );
      }

      // Determine organizer name with fallbacks
      const organizerName =
        userProfile.name ||
        createdEvent.organizer?.displayName ||
        createdEvent.organizer?.name ||
        createdEvent.organizer?.email ||
        'user';

      console.log('Google Calendar - Organizer name for database:', {
        userProfileName: userProfile.name,
        organizerDisplayName: createdEvent.organizer?.displayName,
        organizerName: createdEvent.organizer?.name,
        organizerEmail: createdEvent.organizer?.email,
        finalOrganizerName: organizerName,
      });

      // Save to MongoDB
      const startTime = eventData.startTime;
      const endTime = eventData.endTime;

      const calendarEvent = new this.calendarEventModel({
        externalId: createdEvent.id,
        provider: 'google',
        userId: createdEvent.organizer?.email,
        leadId: eventData.leadId,
        title: createdEvent.summary,
        description: createdEvent.description,
        startTime: startTime ? new Date(startTime) : new Date(),
        endTime: endTime ? new Date(endTime) : new Date(),
        timeZone: createdEvent.start.timeZone,
        isAllDay: !createdEvent.start.dateTime,
        locationType: eventData.locationType,
        locationDetails: createdEvent.location,
        attendees:
          createdEvent.attendees?.map((a) => ({
            email: a.email,
            name: a.displayName,
            status: a.responseStatus,
          })) || [],
        organizer: createdEvent.organizer?.email,
        organizerName: organizerName,
        meetingLink: createdEvent.hangoutLink,
        isOnlineMeeting: !!createdEvent.conferenceData,
        onlineMeetingProvider: createdEvent.conferenceData
          ? 'google_meet'
          : undefined,
        outcome: eventData.outcome,
      });

      await calendarEvent.save();

      console.log('Google Calendar - Event created successfully:', {
        eventId: createdEvent.id,
        title: createdEvent.summary,
        organizer: createdEvent.organizer,
        organizerFields: createdEvent.organizer
          ? Object.keys(createdEvent.organizer)
          : 'No organizer',
      });

      // Log calendar event creation activity
      try {
        if (eventData.leadId) {
          // Try to get user profile for better name
          const userProfile = await this.getUserProfile(accessToken);

          const organizerName =
            userProfile.name ||
            createdEvent.organizer?.displayName ||
            createdEvent.organizer?.name ||
            createdEvent.organizer?.email ||
            'user';

          console.log('Google Calendar - Organizer info for activity:', {
            organizer: createdEvent.organizer,
            userProfile,
            organizerName,
            email: createdEvent.organizer?.email,
            displayName: createdEvent.organizer?.displayName,
            name: createdEvent.organizer?.name,
          });

          const activityPayload: ActivityPayload = {
            leadId: eventData.leadId,
            activityType: ActivityType.CALENDAR_EVENT_CREATED,
            description: `Calendar event '${createdEvent.summary}' created by ${createdEvent.organizer?.name || createdEvent.organizer?.displayName || createdEvent.organizer?.email || 'user'}`,
            performedBy: createdEvent.organizer?.email || 'system',
            metadata: {
              eventTitle: createdEvent.summary,
              eventStartTime: startTime,
              eventEndTime: endTime,
              eventLocation: createdEvent.location,
              eventProvider: 'google',
              eventId: createdEvent.id,
              leadId: eventData.leadId,
              attendees: createdEvent.attendees?.length || 0,
              isOnlineMeeting: !!createdEvent.conferenceData,
              meetingLink: createdEvent.hangoutLink,
            },
          };
          await this.activityClientService.logActivity(activityPayload);
          console.log(
            'Google Calendar - Activity logged successfully for event creation',
          );
        } else {
          console.warn(
            'Google Calendar - No leadId provided, skipping activity logging',
          );
        }
      } catch {
        // Remove unused variable warning by not declaring it
        console.error('Failed to log calendar event activity');
      }

      return {
        success: true,
        data: [
          {
            id: createdEvent.id,
            title: createdEvent.summary,
            leadId: eventData.leadId,
            startTime:
              createdEvent.start.dateTime || createdEvent.start.date || '',
            endTime: createdEvent.end.dateTime || createdEvent.end.date || '',
            meetingLink: createdEvent.hangoutLink,
            attendees:
              createdEvent.attendees?.map((a) => ({
                email: a.email,
                name: a.displayName,
                status: a.responseStatus,
              })) || [],
            location: createdEvent.location,
            organizer: createdEvent.organizer?.email || '',
            organizerName: createdEvent.organizer?.displayName || '',
            description: createdEvent.description,
            isOnlineMeeting: !!createdEvent.conferenceData,
            onlineMeetingProvider: createdEvent.conferenceData
              ? 'google_meet'
              : undefined,
            outcome: eventData.outcome,
          },
        ],
      };
    } catch (error: unknown) {
      const errorObj = error as HttpErrorResponse;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const responseData = errorObj?.response?.data;

      console.error('Google Calendar - Create Event Error:', error);
      if (errorObj instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        responseData?.error?.message ||
          errorMessage ||
          'Failed to create calendar event',
      );
    }
  }

  async deleteEvent(
    accessToken: string,
    eventId: string,
  ): Promise<DeleteEventResponse> {
    try {
      // Only attempt to delete from external calendar if access token is provided
      if (accessToken && accessToken.trim() !== '') {
        try {
          await this.makeGoogleApiCall(
            accessToken,
            `/calendars/primary/events/${eventId}`,
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
          // Continue with local deletion even if external deletion fails
        }
      }

      // Soft delete in MongoDB
      await this.calendarEventModel.findOneAndUpdate(
        { externalId: eventId },
        { isActive: false },
      );

      // Log calendar event deletion activity
      let eventDetails: EventDetails | null = null;
      try {
        // Get event details before deletion for activity log
        eventDetails = await this.calendarEventModel.findOne({
          externalId: eventId,
        });
        if (eventDetails && eventDetails.leadId) {
          const activityPayload: ActivityPayload = {
            leadId: eventDetails.leadId,
            activityType: ActivityType.CALENDAR_EVENT_DELETED,
            description: `Calendar event '${eventDetails.title}' deleted by user`,
            performedBy: 'system',
            metadata: {
              eventTitle: eventDetails.title,
              eventStartTime: eventDetails.startTime,
              eventEndTime: eventDetails.endTime,
              eventLocation: eventDetails.locationDetails,
              eventProvider: 'google',
              eventId: eventId,
              leadId: eventDetails.leadId,
              attendees: eventDetails.attendees?.length || 0,
              isOnlineMeeting: eventDetails.isOnlineMeeting,
              meetingLink: eventDetails.meetingLink,
            },
          };
          await this.activityClientService.logActivity(activityPayload);
          console.log(
            'Google Calendar - Activity logged successfully for event deletion',
          );
        }
      } catch {
        console.warn(
          'Google Calendar - Failed to log activity for event deletion',
        );
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
    try {
      // Get existing event first to handle partial updates
      const existingEvent = await this.makeGoogleApiCall<GoogleCalendarEvent>(
        accessToken,
        `/calendars/primary/events/${eventId}`,
        'GET',
      );

      // Validate time logic if both start and end times are provided
      if (eventData.startTime && eventData.endTime) {
        this.validateTimeLogic(eventData.startTime, eventData.endTime);
      }

      // Create properly typed Google event object
      const googleEvent: Partial<GoogleCalendarEvent> = {};

      if (eventData.title) googleEvent.summary = eventData.title;
      if (eventData.description)
        googleEvent.description = eventData.description;

      // Handle start time - if only startTime is provided, keep existing endTime
      if (eventData.startTime) {
        googleEvent.start = {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || existingEvent.start.timeZone,
        };

        // If endTime is not provided, calculate it based on existing duration
        if (!eventData.endTime) {
          const existingStart = new Date(
            existingEvent.start.dateTime ||
              existingEvent.start.date ||
              new Date(),
          );
          const existingEnd = new Date(
            existingEvent.end.dateTime || existingEvent.end.date || new Date(),
          );
          const duration = existingEnd.getTime() - existingStart.getTime();
          const newStart = new Date(eventData.startTime);
          const newEnd = new Date(newStart.getTime() + duration);

          googleEvent.end = {
            dateTime: newEnd.toISOString(),
            timeZone: eventData.timeZone || existingEvent.end.timeZone,
          };
        }
      }

      // Handle end time
      if (eventData.endTime) {
        googleEvent.end = {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || existingEvent.end.timeZone,
        };

        // If startTime is not provided, keep existing startTime
        if (!eventData.startTime) {
          googleEvent.start = {
            dateTime:
              existingEvent.start.dateTime || existingEvent.start.date || '',
            timeZone: eventData.timeZone || existingEvent.start.timeZone,
          };
        }
      }

      if (eventData.attendees) {
        googleEvent.attendees = eventData.attendees.map((attendee) => ({
          email: attendee.email,
          displayName: attendee.name || undefined,
          responseStatus:
            attendee.responseRequired === true ||
            attendee.responseRequired === 'REQUIRED'
              ? 'accepted'
              : 'needsAction',
        }));
      }

      if (eventData.locationType) {
        if (eventData.locationType === MeetingLocationType.IN_PERSON) {
          googleEvent.location = eventData.locationDetails;
          googleEvent.conferenceData = undefined;
        } else if (eventData.locationType === MeetingLocationType.GOOGLE_MEET) {
          googleEvent.conferenceData = {
            createRequest: {
              requestId: Math.random().toString(36).substring(7),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          };
        }
      }

      if (eventData.locationDetails) {
        googleEvent.location = eventData.locationDetails;
      }

      console.log('Google Calendar - Update payload:', googleEvent);

      const updatedEvent = await this.makeGoogleApiCall<GoogleCalendarEvent>(
        accessToken,
        `/calendars/primary/events/${eventId}`,
        'PATCH',
        googleEvent,
      );

      // Update in MongoDB with properly typed update data
      const updateData: Partial<CalendarEvent> = {};
      if (eventData.title) updateData.title = updatedEvent.summary;
      if (eventData.description)
        updateData.description = updatedEvent.description;
      if (eventData.startTime)
        updateData.startTime = new Date(
          updatedEvent.start.dateTime || updatedEvent.start.date || new Date(),
        );
      if (eventData.endTime)
        updateData.endTime = new Date(
          updatedEvent.end.dateTime || updatedEvent.end.date || new Date(),
        );
      if (eventData.timeZone) updateData.timeZone = updatedEvent.start.timeZone;
      if (eventData.isAllDay !== undefined)
        updateData.isAllDay = eventData.isAllDay;
      if (eventData.locationType)
        updateData.locationType = eventData.locationType;
      if (eventData.locationDetails)
        updateData.locationDetails = updatedEvent.location;
      if (eventData.leadId) updateData.leadId = eventData.leadId;
      if (eventData.attendees)
        updateData.attendees =
          updatedEvent.attendees?.map((a) => ({
            email: a.email,
            name: a.displayName,
            status: a.responseStatus,
          })) || [];
      if (eventData.organizer)
        updateData.organizer = updatedEvent.organizer?.email || '';
      if (updatedEvent.hangoutLink)
        updateData.meetingLink = updatedEvent.hangoutLink;
      if (updatedEvent.conferenceData !== undefined)
        updateData.isOnlineMeeting = !!updatedEvent.conferenceData;
      if (updatedEvent.conferenceData)
        updateData.onlineMeetingProvider = 'google_meet';
      if (eventData.outcome) updateData.outcome = eventData.outcome;

      // Get user profile for organizer name
      let organizerName =
        updatedEvent.organizer?.name ||
        updatedEvent.organizer?.displayName ||
        '';
      if (!organizerName && updatedEvent.organizer?.email) {
        try {
          const userProfile = await this.getUserProfile(accessToken);
          if (userProfile.email === updatedEvent.organizer.email) {
            organizerName = userProfile.name || '';
          }
        } catch (profileError: unknown) {
          const errorMessage =
            profileError instanceof Error
              ? profileError.message
              : String(profileError);
          console.warn(
            'Google Calendar - Failed to get user profile for update:',
            errorMessage,
          );
        }
      }

      if (organizerName) {
        updateData.organizerName = organizerName;
      }

      // Update the event in MongoDB
      await this.calendarEventModel.findOneAndUpdate(
        { externalId: eventId },
        updateData,
        { new: true },
      );

      // Log activity
      try {
        await this.activityClientService.logActivity({
          leadId: eventData.leadId as string,
          activityType: ActivityType.CALENDAR_EVENT_UPDATED,
          description: `Calendar event '${updatedEvent.summary}' updated`,
          performedBy: updatedEvent.organizer?.email || 'system',
          metadata: {
            eventTitle: updatedEvent.summary,
            eventId: updatedEvent.id,
            leadId: eventData.leadId,
            updatedFields: Object.keys(updateData),
          },
        });
      } catch {
        // Remove unused variable warning by not declaring it
        console.error('Failed to log calendar event activity');
      }

      return {
        success: true,
        data: [
          {
            id: updatedEvent.id,
            title: updatedEvent.summary,
            leadId: eventData.leadId as string,
            startTime:
              updatedEvent.start.dateTime || updatedEvent.start.date || '',
            endTime: updatedEvent.end.dateTime || updatedEvent.end.date || '',
            meetingLink: updatedEvent.hangoutLink,
            attendees:
              updatedEvent.attendees?.map((a) => ({
                email: a.email,
                name: a.displayName,
                status: a.responseStatus,
              })) || [],
            location: updatedEvent.location,
            organizer: updatedEvent.organizer?.email || '',
            organizerName: organizerName,
            description: updatedEvent.description,
            isOnlineMeeting: !!updatedEvent.conferenceData,
            onlineMeetingProvider: updatedEvent.conferenceData
              ? 'google_meet'
              : undefined,
            outcome: eventData.outcome,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Failed to update calendar event: ${errorMessage}`,
      );
    }
  }

  async getContacts(accessToken: string): Promise<ContactWithDetails[]> {
    try {
      const peopleApiUrl = 'https://people.googleapis.com/v1';

      // Try the standard connections endpoint first
      const personalContacts =
        await this.makeGoogleApiCall<GooglePeopleResponse>(
          accessToken,
          '/people/me/connections?pageSize=1000&personFields=emailAddresses,names,phoneNumbers,organizations',
          'GET',
          undefined,
          peopleApiUrl,
        );

      // If no email addresses found, try alternative endpoints
      if (!personalContacts.people || personalContacts.people.length === 0) {
        console.log(
          'Google Contacts - No personal contacts found, trying other endpoints',
        );

        // Try the otherContacts endpoint which might have more complete data
        try {
          const otherContacts =
            await this.makeGoogleApiCall<GooglePeopleResponse>(
              accessToken,
              '/people/me/otherContacts?pageSize=1000&readMask=emailAddresses,names,phoneNumbers,organizations',
              'GET',
              undefined,
              peopleApiUrl,
            );

          if (otherContacts.people && otherContacts.people.length > 0) {
            console.log(
              'Google Contacts - Found other contacts with count:',
              otherContacts.people.length,
            );
            return this.processContacts(otherContacts.people);
          }
        } catch (otherContactsError: unknown) {
          const errorMessage =
            otherContactsError instanceof Error
              ? otherContactsError.message
              : String(otherContactsError);
          console.warn(
            'Google Contacts - Failed to get other contacts:',
            errorMessage,
          );
        }

        // Try to get contact groups and their members
        try {
          const contactGroups =
            await this.makeGoogleApiCall<GoogleContactGroupsResponse>(
              accessToken,
              '/contactGroups',
              'GET',
              undefined,
              peopleApiUrl,
            );

          console.log('Google Contacts - Contact groups response:', {
            groupsCount: contactGroups.contactGroups?.length || 0,
          });

          if (
            contactGroups.contactGroups &&
            contactGroups.contactGroups.length > 0
          ) {
            const allGroupContacts: Contact[] = [];

            for (const group of contactGroups.contactGroups) {
              if (
                group.memberResourceNames &&
                group.memberResourceNames.length > 0
              ) {
                try {
                  const groupContacts =
                    await this.makeGoogleApiCall<GooglePeopleResponse>(
                      accessToken,
                      `/people:searchDirectoryPeople?query=&readMask=emailAddresses,names,phoneNumbers,organizations&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE,DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT&directorySourceType=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE,DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT`,
                      'GET',
                      undefined,
                      peopleApiUrl,
                    );

                  if (groupContacts.people) {
                    allGroupContacts.push(...groupContacts.people);
                  }
                } catch (groupError: unknown) {
                  const errorMessage =
                    groupError instanceof Error
                      ? groupError.message
                      : String(groupError);
                  console.warn(
                    `Google Contacts - Failed to get contacts for group ${group.resourceName}:`,
                    errorMessage,
                  );
                }
              }
            }

            if (allGroupContacts.length > 0) {
              console.log(
                'Google Contacts - Found group contacts with count:',
                allGroupContacts.length,
              );
              return this.processContacts(allGroupContacts);
            }
          }
        } catch (groupsError: unknown) {
          const errorMessage =
            groupsError instanceof Error
              ? groupsError.message
              : String(groupsError);
          console.warn(
            'Google Contacts - Failed to get contact groups:',
            errorMessage,
          );
        }
      }

      // Process personal contacts if found
      if (personalContacts.people && personalContacts.people.length > 0) {
        console.log(
          'Google Contacts - Found personal contacts with count:',
          personalContacts.people.length,
        );
        return this.processContacts(personalContacts.people);
      }

      console.log('Google Contacts - No contacts found');
      return [];
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Google Contacts - Error fetching contacts:', errorMessage);
      throw new BadRequestException(
        `Failed to fetch contacts: ${errorMessage}`,
      );
    }
  }

  private processContacts(contacts: Contact[]): ContactWithDetails[] {
    const processedContacts: ContactWithDetails[] = [];

    for (const contact of contacts) {
      const name =
        contact.names?.[0]?.displayName ||
        contact.names?.[0]?.givenName ||
        'Unknown';
      const email = contact.emailAddresses?.[0]?.value || '';
      const phone = contact.phoneNumbers?.[0]?.value || '';
      const organization = contact.organizations?.[0]?.name || '';
      const title = contact.organizations?.[0]?.title || '';

      if (email) {
        processedContacts.push({
          id: contact.resourceName,
          name,
          email,
          phone,
          organization,
          title,
        });
      }
    }

    return this.removeDuplicateContacts(processedContacts);
  }

  private removeDuplicateContacts(
    contacts: ContactWithDetails[],
  ): ContactWithDetails[] {
    const uniqueContacts = new Map<string, ContactWithDetails>();

    for (const contact of contacts) {
      const key = contact.email.toLowerCase();
      if (!uniqueContacts.has(key)) {
        uniqueContacts.set(key, contact);
      }
    }

    return Array.from(uniqueContacts.values());
  }

  async getUserProfile(
    accessToken: string,
  ): Promise<{ name?: string; email?: string }> {
    try {
      const userProfile = await this.makeGoogleApiCall<GoogleUserProfile>(
        accessToken,
        '/userinfo',
        'GET',
        undefined,
        'https://www.googleapis.com/oauth2/v2',
      );

      console.log('Google Calendar - User profile:', userProfile);
      return {
        name:
          userProfile.name ||
          userProfile.given_name + ' ' + userProfile.family_name,
        email: userProfile.email,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn('Failed to get user profile:', errorMessage);
      return {};
    }
  }
}
