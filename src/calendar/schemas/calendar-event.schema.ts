import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Document } from 'mongoose';
import { MeetingLocationType } from '../types/meeting-location.type';

@Schema()
class CalendarEventAttendee {
  @Prop({ required: true })
  email: string;

  @Prop()
  name?: string;

  @Prop()
  status?: string;
}

const CalendarEventAttendeeSchema = SchemaFactory.createForClass(
  CalendarEventAttendee,
);

@Schema({ timestamps: true })
export class CalendarEvent extends Document {
  @Prop({ required: true })
  externalId: string;

  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  leadId: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop()
  timeZone?: string;

  @Prop({ default: false })
  isAllDay: boolean;

  @Prop({ type: String, enum: MeetingLocationType, required: true })
  locationType: MeetingLocationType;

  @Prop()
  locationDetails?: string;

  @Prop({ type: [CalendarEventAttendeeSchema] })
  attendees: CalendarEventAttendee[];

  @Prop({ required: true })
  organizer: string;

  @ApiProperty({ description: 'Organizer display name', required: false })
  @Prop()
  organizerName?: string;

  @Prop()
  meetingLink?: string;

  @Prop({ default: false })
  isOnlineMeeting: boolean;

  @Prop()
  onlineMeetingProvider?: string;

  @Prop({ default: true })
  isActive: boolean;

  @ApiProperty({
    description: 'Meeting outcome, notes, or results',
    required: false,
  })
  @Prop()
  outcome?: string;
}

export const CalendarEventSchema = SchemaFactory.createForClass(CalendarEvent);
