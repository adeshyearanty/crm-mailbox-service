import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { MeetingLocationType } from '../types/meeting-location.type';

export enum AttendeeResponseRequired {
  REQUIRED = 'REQUIRED',
  OPTIONAL = 'OPTIONAL',
}

export class AttendeeDto {
  @ApiProperty({ description: 'Email address of the attendee' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Name of the attendee', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description:
      'Whether response is required from this attendee. Can be boolean (true/false) or string (REQUIRED/OPTIONAL)',
    oneOf: [
      { type: 'boolean' },
      { type: 'string', enum: ['REQUIRED', 'OPTIONAL'] },
    ],
    required: false,
  })
  @IsOptional()
  responseRequired?: boolean | 'REQUIRED' | 'OPTIONAL';
}

export class CreateEventDto {
  @ApiProperty({ description: 'Title of the event' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'ID of the lead associated with this event' })
  @IsString()
  @IsNotEmpty()
  leadId: string;

  @ApiProperty({ description: 'Description of the event', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Start time of the event in ISO format' })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ description: 'End time of the event in ISO format' })
  @IsString()
  @IsNotEmpty()
  endTime: string;

  @ApiProperty({ description: 'Time zone for the event', required: false })
  @IsString()
  @IsOptional()
  timeZone?: string;

  @ApiProperty({
    description: 'Whether the event is an all-day event',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isAllDay?: boolean;

  @ApiProperty({
    description: 'Type of meeting location',
    enum: MeetingLocationType,
  })
  @IsEnum(MeetingLocationType)
  locationType: MeetingLocationType;

  @ApiProperty({
    description: 'Details of the location (e.g., room number, address)',
    required: false,
  })
  @IsString()
  @IsOptional()
  locationDetails?: string;

  @ApiProperty({ description: 'List of attendees', type: [AttendeeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees: AttendeeDto[];

  @ApiProperty({ description: 'Email of the event organizer' })
  @IsEmail()
  @IsNotEmpty()
  organizer: string;

  @ApiProperty({
    description: 'Display name of the event organizer',
    required: false,
  })
  @IsString()
  @IsOptional()
  organizerName?: string;

  @ApiProperty({
    description: 'Meeting outcome, notes, or results',
    required: false,
  })
  @IsString()
  @IsOptional()
  outcome?: string;
}
