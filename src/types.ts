export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  picture: string;
  onboardedAt: string | null;
}

export interface AppEvent {
  _id: string;
  name: string;
  date: string;
  createdAt: string;
  attendeeCount?: number;
  printedCount?: number;
  authorName?: string;
  authorPicture?: string;
}

export type PrintStatus = 'not_printed' | 'printed';

export interface Attendee {
  _id: string;
  eventId: string;
  fullName: string;
  extra: Record<string, string>;
  printStatus: PrintStatus;
  printCount: number;
  lastPrintedAt: string | null;
}

export interface NewAttendee {
  fullName: string;
  extra: Record<string, string>;
}
