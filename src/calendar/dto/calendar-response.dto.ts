import { ApiProperty } from '@nestjs/swagger';

export class CalendarEventAttendeeResponse {
  @ApiProperty({ description: 'Email address of the attendee' })
  email: string;

  @ApiProperty({ description: 'Name of the attendee', required: false })
  name?: string;

  @ApiProperty({
    description: 'Response status of the attendee',
    required: false,
  })
  status?: string;
}

export class CalendarEventResponse {
  @ApiProperty({ description: 'Unique identifier of the event' })
  id: string;

  @ApiProperty({ description: 'Title of the event' })
  title: string;

  @ApiProperty({ description: 'ID of the lead associated with this event' })
  leadId: string;

  @ApiProperty({ description: 'Start time of the event' })
  startTime: string;

  @ApiProperty({ description: 'End time of the event' })
  endTime: string;

  @ApiProperty({
    description: 'Meeting link for online events',
    required: false,
  })
  meetingLink?: string;

  @ApiProperty({
    description: 'Location details for in-person events',
    required: false,
  })
  location?: string;

  @ApiProperty({
    description: 'List of event attendees',
    type: [CalendarEventAttendeeResponse],
  })
  attendees: CalendarEventAttendeeResponse[];

  @ApiProperty({ description: 'Email of the event organizer' })
  organizer: string;

  @ApiProperty({
    description: 'Display name of the event organizer',
    required: false,
  })
  organizerName?: string;

  @ApiProperty({ description: 'Description of the event', required: false })
  description?: string;

  @ApiProperty({
    description: 'Whether the event is an online meeting',
    required: false,
  })
  isOnlineMeeting?: boolean;

  @ApiProperty({
    description: 'Provider of the online meeting (e.g., Teams, Google Meet)',
    required: false,
  })
  onlineMeetingProvider?: string;

  @ApiProperty({
    description: 'Meeting outcome, notes, or results',
    required: false,
  })
  outcome?: string;
}

export class CalendarResponse {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({
    description: 'Response data',
    type: CalendarEventResponse,
    isArray: true,
  })
  data: CalendarEventResponse[];
}

export class DeleteEventResponse {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({
    description: 'Response data',
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Success message' },
      eventId: { type: 'string', description: 'ID of the deleted event' },
    },
  })
  data: {
    message: string;
    eventId: string;
  };

  @ApiProperty({ description: 'HTTP status code' })
  statusCode: number;
}

export class ContactEmailAddress {
  @ApiProperty({ description: 'Email address' })
  address: string;

  @ApiProperty({ description: 'Display name for the email' })
  name: string;

  @ApiProperty({ description: 'Type of email address (work, personal, etc.)' })
  type: string;
}

export class ContactResponse {
  @ApiProperty({ description: 'Unique identifier of the contact' })
  id: string;

  @ApiProperty({ description: 'Display name of the contact' })
  displayName: string;

  @ApiProperty({
    description: 'Email addresses of the contact',
    type: [ContactEmailAddress],
  })
  emailAddresses: ContactEmailAddress[];

  @ApiProperty({ description: 'Business phone numbers', type: [String] })
  businessPhones: string[];

  @ApiProperty({ description: 'Mobile phone number' })
  mobilePhone?: string;

  @ApiProperty({ description: 'Job title' })
  jobTitle?: string;

  @ApiProperty({ description: 'Company name' })
  companyName?: string;

  @ApiProperty({ description: 'Department' })
  department?: string;

  @ApiProperty({ description: 'Office location' })
  officeLocation?: string;

  @ApiProperty({ description: 'Source of the contact (google or microsoft)' })
  source: string;
}

export class ContactsDataResponse {
  @ApiProperty({ description: 'List of contacts', type: [ContactResponse] })
  contacts: ContactResponse[];

  @ApiProperty({ description: 'Total number of contacts' })
  totalCount: number;

  @ApiProperty({ description: 'Source provider (google or microsoft)' })
  source: string;

  @ApiProperty({
    description: 'Optional message about contacts access',
    required: false,
  })
  message?: string;
}

export class ContactsResponse {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response data', type: ContactsDataResponse })
  data: ContactsDataResponse;
}
