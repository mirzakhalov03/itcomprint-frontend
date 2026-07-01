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
  templateId: string | null;
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

export interface TemplateZone {
  id: string;
  type: 'field' | 'static';
  field?: string; // present when type='field'
  staticText?: string; // present when type='static'
  fontFamily: string;
  fontSize: number; // pt value, 6–96
  bold: boolean;
  align: 'left' | 'center' | 'right';
  hidden: boolean;
}

export interface BadgeTemplate {
  _id: string;
  name: string;
  labelWidthMm: number;
  labelHeightMm: number;
  zones: TemplateZone[];
  isDefault: boolean;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type TemplateInput = Pick<
  BadgeTemplate,
  'name' | 'labelWidthMm' | 'labelHeightMm' | 'zones'
>;
