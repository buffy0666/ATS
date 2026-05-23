/**
 * Minimal RFC 5545 (iCalendar) generator.
 *
 * We deliberately don't depend on a library — the spec we need (single VEVENTs,
 * UTC times, attendees, status) is small and predictable. If you need recurring
 * events, alarms, or full timezone components, swap in `ics` or `node-ical`.
 *
 * Output is CRLF-line-terminated as the spec requires and uses lines folded at
 * 75 octets. Most modern calendar apps tolerate slightly looser output, but
 * Outlook in particular has been known to reject malformed files.
 */

export type ICalEvent = {
  uid: string;
  startAt: Date;
  endAt: Date;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer?: { email: string; name?: string | null };
  attendees?: Array<{ email: string; name?: string | null; role?: string | null }>;
  status?: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
  /** Last update time — used for SEQUENCE bumping when invites are re-sent. */
  updatedAt?: Date;
  sequence?: number;
};

const DOMAIN = "ats.local";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatUtc(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Fold lines to 75 octets per RFC 5545, with continuation prefix space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    const slice = line.slice(i, i + (i === 0 ? 75 : 74));
    chunks.push(slice);
    i += i === 0 ? 75 : 74;
  }
  return chunks.join("\r\n ");
}

function buildEvent(event: ICalEvent): string[] {
  const lines: string[] = [];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${event.uid}@${DOMAIN}`);
  lines.push(`DTSTAMP:${formatUtc(event.updatedAt ?? new Date())}`);
  lines.push(`DTSTART:${formatUtc(event.startAt)}`);
  lines.push(`DTEND:${formatUtc(event.endAt)}`);
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }
  if (event.url) {
    lines.push(`URL:${event.url}`);
  }
  if (event.status) {
    lines.push(`STATUS:${event.status}`);
  }
  if (typeof event.sequence === "number") {
    lines.push(`SEQUENCE:${event.sequence}`);
  }
  if (event.organizer) {
    const cn = event.organizer.name ? `;CN=${escapeText(event.organizer.name)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${event.organizer.email}`);
  }
  for (const a of event.attendees ?? []) {
    const cn = a.name ? `;CN=${escapeText(a.name)}` : "";
    const role = a.role ? `;ROLE=${a.role.toUpperCase().replace(/[^A-Z_-]/g, "_")}` : "";
    lines.push(`ATTENDEE${cn}${role};RSVP=TRUE:mailto:${a.email}`);
  }
  lines.push("END:VEVENT");
  return lines.map(foldLine);
}

export function buildICalendar(events: ICalEvent[], opts?: { calendarName?: string }): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ATS//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (opts?.calendarName) {
    lines.push(`X-WR-CALNAME:${escapeText(opts.calendarName)}`);
  }
  for (const ev of events) {
    lines.push(...buildEvent(ev));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
