import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';

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

@Schema()
class LoggedMeetingParticipant {
  @Prop({ required: true })
  email: string;

  @Prop()
  name?: string;

  @Prop({ default: false })
  isExternal: boolean;

  @Prop()
  status?: string;
}

const LoggedMeetingParticipantSchema = SchemaFactory.createForClass(
  LoggedMeetingParticipant,
);

// @Schema()
// class LoggedMeetingAttachment {
//   @Prop({ required: true })
//   key: string;

//   @Prop({ required: true })
//   name: string;

//   @Prop({ required: true })
//   contentType: string;

//   @Prop()
//   size?: number;

//   @Prop()
//   url?: string;
// }

// const LoggedMeetingAttachmentSchema = SchemaFactory.createForClass(
//   LoggedMeetingAttachment,
// );

@Schema({ _id: false })
export class LoggedMeetingLocation {
  @ApiProperty({ description: 'Display name of the location', required: false })
  @Prop()
  displayName?: string;
}

@Schema({ timestamps: true })
export class LoggedMeeting extends Document {
  @ApiProperty({ description: 'Title of the logged meeting' })
  @Prop({ required: true })
  title: string;

  @ApiProperty({ description: 'Type of meeting', enum: MeetingType })
  @Prop({ type: String, enum: MeetingType, required: true })
  meetingType: MeetingType;

  @ApiProperty({
    description: 'Virtual meeting provider (for virtual meetings)',
    enum: VirtualMeetingProvider,
    required: false,
  })
  @Prop({ type: String, enum: VirtualMeetingProvider })
  virtualMeetingProvider?: VirtualMeetingProvider;

  @ApiProperty({ description: 'Date and time of the meeting' })
  @Prop({ required: true })
  meetingDateTime: Date;

  @ApiProperty({ description: 'Duration of the meeting' })
  @Prop()
  duration: number;

  @ApiProperty({ description: 'Summary of the meeting' })
  @Prop({ required: true })
  summary: string;

  @ApiProperty({ description: 'Outcome of the meeting', enum: MeetingOutcome })
  @Prop({ type: String, enum: MeetingOutcome, required: true })
  outcome: MeetingOutcome;

  @ApiProperty({
    description: 'List of meeting participants',
    type: [LoggedMeetingParticipant],
  })
  @Prop({ type: [LoggedMeetingParticipantSchema], required: true })
  participants: LoggedMeetingParticipant[];

  @ApiProperty({
    description: 'Location of the meeting',
    required: false,
    type: String,
  })
  @Prop()
  location?: string;

  @ApiProperty({ description: 'ID of the lead associated with this meeting' })
  @Prop({ required: true })
  leadId: string;

  @ApiProperty({ description: 'ID of the user who logged the meeting' })
  @Prop({ required: true })
  loggedBy: string;

  @ApiProperty({ description: 'ID of the organization' })
  @Prop({ required: true })
  organizationId: string;

  @ApiProperty({ description: 'ID of the created activity', required: false })
  @Prop()
  activityId?: string;

  @ApiProperty({
    description: 'ID of the created follow-up task',
    required: false,
  })
  @Prop()
  taskId?: string;

  @ApiProperty({
    description: 'File attachment URL',
    required: false,
    type: String,
  })
  @Prop()
  attachment?: string;

  @ApiProperty({
    description: 'Additional metadata for analytics',
    required: false,
  })
  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @ApiProperty({
    description: 'Whether the meeting is active',
    required: false,
  })
  @Prop({ default: true })
  isActive: boolean;

  @ApiProperty({
    description: 'Whether this is a logged meeting',
    default: true,
  })
  @Prop({ default: true })
  isLoggedMeeting: boolean;
}

export const LoggedMeetingSchema = SchemaFactory.createForClass(LoggedMeeting);
