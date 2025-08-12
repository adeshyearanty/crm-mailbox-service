import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum MeetingType {
  VIRTUAL = 'VIRTUAL',
  IN_PERSON = 'IN_PERSON',
  PHONE = 'PHONE',
}

export enum VirtualMeetingProvider {
  TEAMS = 'TEAMS',
  GOOGLE_MEET = 'GOOGLE_MEET',
  ZOOM = 'ZOOM',
  OTHER = 'OTHER',
}

export enum MeetingOutcome {
  FOLLOW_UP_REQUIRED = 'FOLLOW_UP_REQUIRED',
  NO_RESPONSE = 'NO_RESPONSE',
  NO_SHOW_UP = 'NO_SHOW_UP',
  RESCHEDULED = 'RESCHEDULED',
  CANCELLED = 'CANCELLED',
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  SUCCESSFUL = 'SUCCESSFUL',
}

export class MeetingParticipantDto {
  @ApiProperty({ description: 'Email address of the participant' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Name of the participant', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Whether the participant is external',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isExternal?: boolean;
}

export class FollowUpTaskDto {
  @ApiProperty({ description: 'Title of the follow-up task' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Description of the follow-up task',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Due date for the follow-up task' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({
    description: 'Priority of the follow-up task',
    required: false,
  })
  @IsString()
  @IsOptional()
  priority?: string;
}

export class LogMeetingDto {
  @ApiProperty({ description: 'ID of the lead associated with this meeting' })
  @IsString()
  @IsNotEmpty()
  leadId: string;

  @ApiProperty({ description: 'Title of the meeting' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Type of meeting', enum: MeetingType })
  @IsEnum(MeetingType)
  meetingType: MeetingType;

  @ApiProperty({
    description:
      'Virtual meeting provider (required if meeting type is VIRTUAL)',
    enum: VirtualMeetingProvider,
    required: false,
  })
  @IsEnum(VirtualMeetingProvider)
  @IsOptional()
  virtualMeetingProvider?: VirtualMeetingProvider;

  @ApiProperty({ description: 'Date and time of the meeting' })
  @IsDateString()
  meetingDateTime: string;

  @ApiProperty({
    description: 'List of meeting participants',
    type: [MeetingParticipantDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeetingParticipantDto)
  participants: MeetingParticipantDto[];

  @ApiProperty({ description: 'Summary of the meeting' })
  @IsString()
  @IsNotEmpty()
  summary: string;

  @ApiProperty({ description: 'Outcome of the meeting', enum: MeetingOutcome })
  @IsEnum(MeetingOutcome)
  outcome: MeetingOutcome;

  @ApiProperty({
    description: 'Whether to create a follow-up task',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  createFollowUpTask?: boolean;

  @ApiProperty({
    description:
      'Follow-up task details (required if createFollowUpTask is true)',
    type: FollowUpTaskDto,
    required: false,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => FollowUpTaskDto)
  @IsOptional()
  followUpTask?: FollowUpTaskDto;

  @ApiProperty({ description: 'File attachment', required: false })
  @IsString()
  @IsOptional()
  attachment?: any;

  @ApiProperty({ description: 'Duration of the meeting', required: false })
  @IsNumber()
  @IsOptional()
  duration?: number;

  @ApiProperty({ description: 'Location of the meeting', required: false })
  @IsString()
  @IsOptional()
  location?: string;
}

export class LogMeetingResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'ID of the logged meeting' })
  meetingId: string;

  @ApiProperty({ description: 'ID of the created activity', required: false })
  activityId?: string;

  @ApiProperty({
    description: 'ID of the created follow-up task',
    required: false,
  })
  taskId?: string;

  @ApiProperty({ description: 'Response message' })
  message: string;
}
