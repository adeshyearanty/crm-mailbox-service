import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityClientService } from '../client/activity-client.service';
import { S3ClientService } from '../client/s3-client.service';
import { TaskClientService } from '../client/task-client.service';
import { CreateEventDto } from '../dto/create-event.dto';
import {
  LogMeetingDto,
  MeetingOutcome,
  MeetingType,
  VirtualMeetingProvider,
} from '../dto/log-meeting.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import { CalendarEvent } from '../schemas/calendar-event.schema';
import { LoggedMeeting } from '../schemas/logged-meeting.schema';
import { GoogleCalendarService } from '../service/google.service';
import { MicrosoftService } from '../service/microsoft.service';
import { MeetingLocationType } from '../types/meeting-location.type';
import {
  CalendarProvider,
  CalenderSyncController,
} from './calendar.controller';

describe('CalenderSyncController', () => {
  let controller: CalenderSyncController;
  let microsoftService: jest.Mocked<MicrosoftService>;
  let googleCalendarService: jest.Mocked<GoogleCalendarService>;
  let calendarEventModel: jest.Mocked<Record<string, jest.Mock>>;
  let loggedMeetingModel: jest.Mocked<Record<string, jest.Mock>>;

  const mockCalendarEvent = {
    _id: 'event-id-1',
    externalId: 'external-event-1',
    title: 'Test Calendar Event',
    startTime: new Date('2024-01-01T10:00:00Z'),
    endTime: new Date('2024-01-01T11:00:00Z'),
    meetingLink: 'https://meet.google.com/test',
    attendees: [{ email: 'test@example.com', name: 'Test User' }],
    locationDetails: 'Conference Room A',
    organizer: 'organizer@example.com',
    organizerName: 'Event Organizer',
    description: 'Test event description',
    isOnlineMeeting: true,
    onlineMeetingProvider: 'Google Meet',
    leadId: 'lead-1',
    outcome: 'Completed',
    timeZone: 'UTC',
    isActive: true,
  };

  const mockLoggedMeeting = {
    _id: 'meeting-id-1',
    title: 'Test Logged Meeting',
    meetingType: MeetingType.VIRTUAL,
    virtualMeetingProvider: VirtualMeetingProvider.ZOOM,
    meetingDateTime: new Date('2024-01-01T14:00:00Z'),
    summary: 'Test meeting summary',
    outcome: MeetingOutcome.FOLLOW_UP_REQUIRED,
    participants: [
      {
        email: 'participant@example.com',
        name: 'Participant',
        isExternal: false,
      },
    ],
    loggedBy: 'system',
    leadId: 'lead-1',
    activityId: 'activity-1',
    taskId: 'task-1',
    attachment: null,
    isActive: true,
  };

  beforeEach(async () => {
    const mockMicrosoftService = {
      createEvent: jest.fn(),
      getEvents: jest.fn(),
      deleteEvent: jest.fn(),
      updateEvent: jest.fn(),
      getContacts: jest.fn(),
    };

    const mockGoogleCalendarService = {
      createEvent: jest.fn(),
      getEvents: jest.fn(),
      deleteEvent: jest.fn(),
      updateEvent: jest.fn(),
      getContacts: jest.fn(),
      getUserProfile: jest.fn(),
    };

    const mockCalendarEventModel = {
      find: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    // Mock as a constructor function
    const mockLoggedMeetingModel = jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) => ({
        ...data,
        save: jest.fn().mockResolvedValue(mockLoggedMeeting),
      }));

    // Add static methods to the mock function
    Object.assign(mockLoggedMeetingModel, {
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn(),
      countDocuments: jest.fn().mockReturnThis(),
      findById: jest.fn().mockReturnThis(),
      findByIdAndUpdate: jest.fn(),
    });

    const mockActivityClientService = {
      logActivity: jest.fn(),
    };
    const mockS3ClientService = {};
    const mockTaskClientService = {
      createTask: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalenderSyncController],
      providers: [
        {
          provide: MicrosoftService,
          useValue: mockMicrosoftService,
        },
        {
          provide: GoogleCalendarService,
          useValue: mockGoogleCalendarService,
        },
        {
          provide: getModelToken(CalendarEvent.name),
          useValue: mockCalendarEventModel,
        },
        {
          provide: getModelToken(LoggedMeeting.name),
          useValue: mockLoggedMeetingModel,
        },
        {
          provide: ActivityClientService,
          useValue: mockActivityClientService,
        },
        {
          provide: S3ClientService,
          useValue: mockS3ClientService,
        },
        {
          provide: TaskClientService,
          useValue: mockTaskClientService,
        },
      ],
    }).compile();

    controller = module.get<CalenderSyncController>(CalenderSyncController);
    microsoftService = module.get(MicrosoftService);
    googleCalendarService = module.get(GoogleCalendarService);
    calendarEventModel = module.get(getModelToken(CalendarEvent.name));
    loggedMeetingModel = module.get(getModelToken(LoggedMeeting.name));
  });

  describe('validateHeaders', () => {
    it('should validate headers successfully', () => {
      const authHeader = 'Bearer valid-token';
      const provider = 'google';

      const result = (
        controller as unknown as {
          validateHeaders: (auth: string, prov: string) => unknown;
        }
      ).validateHeaders(authHeader, provider);

      expect(result).toEqual({
        accessToken: 'valid-token',
        provider: CalendarProvider.GOOGLE,
      });
    });

    it('should throw UnauthorizedException when auth header is missing', () => {
      expect(() => {
        (
          controller as unknown as {
            validateHeaders: (
              auth: string | undefined,
              prov: string,
            ) => unknown;
          }
        ).validateHeaders(undefined, 'google');
      }).toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException when provider header is missing', () => {
      expect(() => {
        (
          controller as unknown as {
            validateHeaders: (
              auth: string,
              prov: string | undefined,
            ) => unknown;
          }
        ).validateHeaders('Bearer token', undefined);
      }).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when provider is invalid', () => {
      expect(() => {
        (
          controller as unknown as {
            validateHeaders: (auth: string, prov: string) => unknown;
          }
        ).validateHeaders('Bearer token', 'invalid-provider');
      }).toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when auth header format is invalid', () => {
      expect(() => {
        (
          controller as unknown as {
            validateHeaders: (auth: string, prov: string) => unknown;
          }
        ).validateHeaders('Bearer ', 'google');
      }).toThrow(UnauthorizedException);
    });
  });

  describe('createEvent', () => {
    const createEventDto: CreateEventDto = {
      title: 'Test Event',
      startTime: '2024-01-01T10:00:00Z',
      endTime: '2024-01-01T11:00:00Z',
      attendees: [{ email: 'test@example.com', name: 'Test User' }],
      leadId: 'lead-1',
      locationType: MeetingLocationType.GOOGLE_MEET,
      organizer: 'organizer@example.com',
    };

    it('should create event with Google provider', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'event-1',
            title: 'Test Event',
            leadId: 'lead-1',
            startTime: '2024-01-01T10:00:00Z',
            endTime: '2024-01-01T11:00:00Z',
            attendees: [{ email: 'test@example.com', name: 'Test User' }],
            organizer: 'organizer@example.com',
          },
        ],
      };
      googleCalendarService.createEvent.mockResolvedValue(mockResponse);

      const result = await controller.createEvent(
        createEventDto,
        'Bearer google-token',
        'google',
      );

      expect(result).toEqual(mockResponse);
      expect(
        googleCalendarService.createEvent.mock.calls.some(
          (call) => call[0] === 'google-token' && call[1] === createEventDto,
        ),
      ).toBe(true);
    });

    it('should create event with Microsoft provider', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'event-1',
            title: 'Test Event',
            leadId: 'lead-1',
            startTime: '2024-01-01T10:00:00Z',
            endTime: '2024-01-01T11:00:00Z',
            attendees: [{ email: 'test@example.com', name: 'Test User' }],
            organizer: 'organizer@example.com',
          },
        ],
      };
      microsoftService.createEvent.mockResolvedValue(mockResponse);

      const result = await controller.createEvent(
        createEventDto,
        'Bearer microsoft-token',
        'microsoft',
      );

      expect(result).toEqual(mockResponse);
      expect(
        microsoftService.createEvent.mock.calls.some(
          (call) => call[0] === 'microsoft-token' && call[1] === createEventDto,
        ),
      ).toBe(true);
    });
  });

  describe('getEvents', () => {
    it('should get events with Google provider', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'external-event-1',
            title: 'Test Calendar Event',
            leadId: 'lead-1',
            startTime: '2024-01-01T10:00:00Z',
            endTime: '2024-01-01T11:00:00Z',
            attendees: [{ email: 'test@example.com', name: 'Test User' }],
            organizer: 'organizer@example.com',
          },
        ],
      };
      googleCalendarService.getEvents.mockResolvedValue(mockResponse);

      const result = await controller.getEvents(
        'Bearer google-token',
        'google',
        '2024-01-01T00:00:00Z',
        '2024-01-02T00:00:00Z',
      );

      expect(result).toEqual(mockResponse);
      expect(
        googleCalendarService.getEvents.mock.calls.some(
          (call) =>
            call[0] === 'google-token' &&
            call[1] === '2024-01-01T00:00:00Z' &&
            call[2] === '2024-01-02T00:00:00Z',
        ),
      ).toBe(true);
    });

    it('should get events with Microsoft provider', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'external-event-1',
            title: 'Test Calendar Event',
            leadId: 'lead-1',
            startTime: '2024-01-01T10:00:00Z',
            endTime: '2024-01-01T11:00:00Z',
            attendees: [{ email: 'test@example.com', name: 'Test User' }],
            organizer: 'organizer@example.com',
          },
        ],
      };
      microsoftService.getEvents.mockResolvedValue(mockResponse);

      const result = await controller.getEvents(
        'Bearer microsoft-token',
        'microsoft',
      );

      expect(result).toEqual(mockResponse);
      expect(
        microsoftService.getEvents.mock.calls.some(
          (call) =>
            call[0] === 'microsoft-token' &&
            call[1] === undefined &&
            call[2] === undefined,
        ),
      ).toBe(true);
    });
  });

  describe('updateEvent', () => {
    const updateEventDto: UpdateEventDto = {
      title: 'Updated Test Event',
      startTime: '2024-01-01T11:00:00Z',
      endTime: '2024-01-01T12:00:00Z',
      attendees: [{ email: 'updated@example.com', name: 'Updated User' }],
      leadId: 'lead-1',
      locationType: MeetingLocationType.GOOGLE_MEET,
      organizer: 'updated@example.com',
    };

    it('should update event with Google provider', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'event-1',
            title: 'Updated Test Event',
            leadId: 'lead-1',
            startTime: '2024-01-01T11:00:00Z',
            endTime: '2024-01-01T12:00:00Z',
            attendees: [{ email: 'updated@example.com', name: 'Updated User' }],
            organizer: 'updated@example.com',
          },
        ],
      };
      googleCalendarService.updateEvent.mockResolvedValue(mockResponse);

      const result = await controller.updateEvent(
        'event-1',
        updateEventDto,
        'Bearer google-token',
        'google',
      );

      expect(result).toEqual(mockResponse);
      expect(
        googleCalendarService.updateEvent.mock.calls.some(
          (call) =>
            call[0] === 'google-token' &&
            call[1] === 'event-1' &&
            call[2] === updateEventDto,
        ),
      ).toBe(true);
    });

    it('should update event with Microsoft provider', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'event-1',
            title: 'Updated Test Event',
            leadId: 'lead-1',
            startTime: '2024-01-01T11:00:00Z',
            endTime: '2024-01-01T12:00:00Z',
            attendees: [{ email: 'updated@example.com', name: 'Updated User' }],
            organizer: 'updated@example.com',
          },
        ],
      };
      microsoftService.updateEvent.mockResolvedValue(mockResponse);

      const result = await controller.updateEvent(
        'event-1',
        updateEventDto,
        'Bearer microsoft-token',
        'microsoft',
      );

      expect(result).toEqual(mockResponse);
      expect(
        microsoftService.updateEvent.mock.calls.some(
          (call) =>
            call[0] === 'microsoft-token' &&
            call[1] === 'event-1' &&
            call[2] === updateEventDto,
        ),
      ).toBe(true);
    });
  });

  describe('deleteEvent', () => {
    it('should delete event with Google provider', async () => {
      const mockResponse = {
        success: true,
        data: {
          message: 'Event deleted successfully',
          eventId: 'event-1',
        },
        statusCode: 200,
      };
      googleCalendarService.deleteEvent.mockResolvedValue(mockResponse);

      const result = await controller.deleteEvent(
        'event-1',
        'Bearer google-token',
        'google',
      );

      expect(result).toEqual(mockResponse);
      expect(
        googleCalendarService.deleteEvent.mock.calls.some(
          (call) => call[0] === 'google-token' && call[1] === 'event-1',
        ),
      ).toBe(true);
    });

    it('should delete event with Microsoft provider', async () => {
      const mockResponse = {
        success: true,
        data: {
          message: 'Event deleted successfully',
          eventId: 'event-1',
        },
        statusCode: 200,
      };
      microsoftService.deleteEvent.mockResolvedValue(mockResponse);

      const result = await controller.deleteEvent(
        'event-1',
        'Bearer microsoft-token',
        'microsoft',
      );

      expect(result).toEqual(mockResponse);
      expect(
        microsoftService.deleteEvent.mock.calls.some(
          (call) => call[0] === 'microsoft-token' && call[1] === 'event-1',
        ),
      ).toBe(true);
    });
  });

  describe('getLocalEvents', () => {
    beforeEach(() => {
      calendarEventModel.exec.mockResolvedValue([mockCalendarEvent]);
      loggedMeetingModel.exec.mockResolvedValue([mockLoggedMeeting]);
    });

    it('should get local events without filters', async () => {
      const result = await controller.getLocalEvents();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(calendarEventModel.find).toHaveBeenCalledWith({ isActive: true });
      expect(loggedMeetingModel.find).toHaveBeenCalledWith({ isActive: true });
    });

    it('should get local events with provider filter', async () => {
      const result = await controller.getLocalEvents('google');

      expect(result.success).toBe(true);
      expect(calendarEventModel.find).toHaveBeenCalledWith({
        isActive: true,
        provider: 'google',
      });
    });

    it('should get local events with userId filter', async () => {
      const result = await controller.getLocalEvents(undefined, 'user-1');

      expect(result.success).toBe(true);
      expect(calendarEventModel.find).toHaveBeenCalledWith({
        isActive: true,
        userId: 'user-1',
      });
    });

    it('should get local events with leadId filter', async () => {
      const result = await controller.getLocalEvents(
        undefined,
        undefined,
        'lead-1',
      );

      expect(result.success).toBe(true);
      expect(calendarEventModel.find).toHaveBeenCalledWith({
        isActive: true,
        leadId: 'lead-1',
      });
      expect(loggedMeetingModel.find).toHaveBeenCalledWith({
        isActive: true,
        leadId: 'lead-1',
      });
    });

    it('should handle user profile fetch for Google Calendar', async () => {
      const userProfile = { name: 'Test User', email: 'test@example.com' };
      googleCalendarService.getUserProfile.mockResolvedValue(userProfile);

      const result = await controller.getLocalEvents(
        undefined,
        undefined,
        'lead-1',
        'Bearer google-token',
        'google',
      );

      expect(result.success).toBe(true);
      expect(googleCalendarService.getUserProfile.mock.calls[0][0]).toEqual(
        expect.any(String),
      );
    });

    it('should handle user profile fetch error gracefully', async () => {
      googleCalendarService.getUserProfile.mockRejectedValue(
        new Error('Profile fetch failed'),
      );

      const result = await controller.getLocalEvents(
        undefined,
        undefined,
        'lead-1',
        'Bearer google-token',
        'google',
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should handle database errors', async () => {
      calendarEventModel.exec.mockRejectedValue(new Error('Database error'));

      await expect(controller.getLocalEvents()).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('debugEvents', () => {
    it('should debug events with Google provider', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'external-event-1',
            title: 'Test Calendar Event',
            leadId: 'lead-1',
            startTime: '2024-01-01T10:00:00Z',
            endTime: '2024-01-01T11:00:00Z',
            attendees: [{ email: 'test@example.com', name: 'Test User' }],
            organizer: 'organizer@example.com',
          },
        ],
      };
      googleCalendarService.getEvents.mockResolvedValue(mockResponse);

      const result = await controller.debugEvents(
        'Bearer google-token',
        'google',
        '2024-01-01T00:00:00Z',
        '2024-01-02T00:00:00Z',
      );

      expect(result.success).toBe(true);
      expect(result.debug).toBeDefined();
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should debug events with Microsoft provider', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'external-event-1',
            title: 'Test Calendar Event',
            leadId: 'lead-1',
            startTime: '2024-01-01T10:00:00Z',
            endTime: '2024-01-01T11:00:00Z',
            attendees: [{ email: 'test@example.com', name: 'Test User' }],
            organizer: 'organizer@example.com',
          },
        ],
      };
      microsoftService.getEvents.mockResolvedValue(mockResponse);

      const result = await controller.debugEvents(
        'Bearer microsoft-token',
        'microsoft',
      );

      expect(result.success).toBe(true);
      expect(result.debug).toBeDefined();
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should handle debug errors gracefully', async () => {
      googleCalendarService.getEvents.mockRejectedValue(
        new Error('Service error'),
      );

      const result = await controller.debugEvents(
        'Bearer google-token',
        'google',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service error');
      expect(result.debug).toBeDefined();
    });
  });

  describe('getContacts', () => {
    it('should get contacts with Google provider', async () => {
      const mockContacts = [
        {
          id: 'contact-1',
          name: 'Test Contact',
          email: 'test@example.com',
          isExternal: true,
        },
      ];
      googleCalendarService.getContacts.mockResolvedValue(mockContacts);

      const result = await controller.getContacts(
        'Bearer google-token',
        'google',
      );

      expect(result).toEqual(mockContacts);
      expect(
        googleCalendarService.getContacts.mock.calls.some(
          (call) => call[0] === 'google-token',
        ),
      ).toBe(true);
    });

    it('should get contacts with Microsoft provider', async () => {
      const mockResponse = {
        success: true,
        data: {
          contacts: [],
          totalCount: 0,
          source: 'microsoft',
        },
      };
      microsoftService.getContacts.mockResolvedValue(mockResponse);

      const result = await controller.getContacts(
        'Bearer microsoft-token',
        'microsoft',
      );

      expect(result).toEqual(mockResponse);
      expect(
        microsoftService.getContacts.mock.calls.some(
          (call) => call[0] === 'microsoft-token',
        ),
      ).toBe(true);
    });
  });

  describe('logMeeting', () => {
    const logMeetingDto: LogMeetingDto = {
      title: 'Test Meeting',
      meetingType: MeetingType.VIRTUAL,
      virtualMeetingProvider: VirtualMeetingProvider.ZOOM,
      meetingDateTime: '2024-01-01T14:00:00Z',
      summary: 'Test meeting summary',
      outcome: MeetingOutcome.FOLLOW_UP_REQUIRED,
      participants: [
        {
          email: 'participant@example.com',
          name: 'Participant',
          isExternal: false,
        },
      ],
      leadId: 'lead-1',
      createFollowUpTask: false,
    };

    it('should log meeting successfully', async () => {
      const result = await controller.logMeeting(logMeetingDto, 'org-1');

      expect(result.success).toBe(true);
      expect(result.meetingId).toBe('meeting-id-1');
      expect(result.message).toBe('Meeting logged successfully');
    });

    it('should throw BadRequestException when organization ID is missing', async () => {
      await expect(controller.logMeeting(logMeetingDto, '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when virtual meeting provider is missing for VIRTUAL meeting', async () => {
      const invalidDto = {
        ...logMeetingDto,
        virtualMeetingProvider: undefined,
      };

      await expect(controller.logMeeting(invalidDto, 'org-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when follow-up task details are missing', async () => {
      const invalidDto = {
        ...logMeetingDto,
        createFollowUpTask: true,
        followUpTask: undefined,
      };

      await expect(controller.logMeeting(invalidDto, 'org-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle database errors', async () => {
      (loggedMeetingModel as unknown as jest.Mock).mockImplementationOnce(
        () => ({
          save: jest.fn().mockRejectedValue(new Error('Database error')),
        }),
      );
      await expect(
        controller.logMeeting(logMeetingDto, 'org-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getLoggedMeetings', () => {
    beforeEach(() => {
      loggedMeetingModel.exec.mockResolvedValue([mockLoggedMeeting]);
      loggedMeetingModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });
    });

    it('should get logged meetings with pagination', async () => {
      const result = await controller.getLoggedMeetings('lead-1', 1, 10);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.pagination).toBeDefined();
      expect(loggedMeetingModel.find).toHaveBeenCalledWith({
        leadId: 'lead-1',
        isActive: true,
      });
    });

    it('should handle database errors', async () => {
      loggedMeetingModel.exec.mockRejectedValue(new Error('Database error'));

      await expect(controller.getLoggedMeetings('lead-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getLoggedMeeting', () => {
    it('should get specific logged meeting', async () => {
      loggedMeetingModel.exec.mockResolvedValue(mockLoggedMeeting);

      const result = await controller.getLoggedMeeting('meeting-id-1');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('meeting-id-1');
      expect(loggedMeetingModel.findById).toHaveBeenCalledWith('meeting-id-1');
    });

    it('should throw BadRequestException when meeting not found', async () => {
      loggedMeetingModel.exec.mockResolvedValue(null);

      await expect(
        controller.getLoggedMeeting('non-existent-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle database errors', async () => {
      loggedMeetingModel.exec.mockRejectedValue(new Error('Database error'));

      await expect(controller.getLoggedMeeting('meeting-id-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
