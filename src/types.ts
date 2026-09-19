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
  sheetId: string | null;
  sheetUrl: string | null;
  lastSyncedAt: string | null;
  deletedAt: string | null;
  purgeAt?: string; // trash listing only
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
  registrantId: string | null;
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
  spaceAboveMm?: number; // extra gap before this zone; absent on older templates
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

/** A half-filled sheet row the sync couldn't import; `row` is the 1-based sheet row. */
export interface SheetIssue {
  row: number;
  registrantId: string;
  fullName: string;
  reason: 'missing_name' | 'missing_id' | 'duplicate_id';
}

export interface SheetSyncResult {
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  total: number;
  issues: SheetIssue[];
  lastSyncedAt: string;
}

export type ActivityAction =
  | 'attendee.print'
  | 'attendee.reprint'
  | 'attendee.unprint'
  | 'event.create'
  | 'event.update'
  | 'event.template'
  | 'event.trash'
  | 'event.restore'
  | 'event.delete'
  | 'template.create'
  | 'template.update'
  | 'template.delete'
  | 'printer.connect'
  | 'printer.disconnect';

export interface ActivityEntry {
  _id: string;
  action: ActivityAction;
  actorName: string;
  actorPicture: string;
  eventId: string | null;
  eventName: string;
  targetName: string;
  createdAt: string;
}

export interface ActivityPage {
  items: ActivityEntry[];
  nextCursor: string | null; // pass as `before` to load the next (older) page
}
