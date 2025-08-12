export enum TaskType {
  CALL = 'Call',
  EMAIL = 'Email',
  MEETING = 'Meeting',
  REMINDER = 'Reminder',
  OTHER = 'Other',
}

export enum TaskStatus {
  PENDING = 'Pending',
  COMPLETED = 'Completed',
  OVERDUE = 'Overdue',
}

export enum TaskPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum ActivityType {
  TASK_CREATED = 'TASK_CREATED',
  TASK_UPDATED = 'TASK_UPDATED',
  TASK_DELETED = 'TASK_DELETED',
  TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED',
  LEAD_CREATED = 'LEAD_CREATED',
  LEAD_UPDATED = 'LEAD_UPDATED',
  LEAD_DELETED = 'LEAD_DELETED',
  CALENDAR_EVENT_CREATED = 'CALENDAR_EVENT_CREATED',
  CALENDAR_EVENT_UPDATED = 'CALENDAR_EVENT_UPDATED',
  CALENDAR_EVENT_DELETED = 'CALENDAR_EVENT_DELETED',
}
