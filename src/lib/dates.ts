import { tz } from "@date-fns/tz";
import { addDays, endOfDay, format, isSameDay, startOfDay } from "date-fns";

// The business works in Spain, so a day is a day there wherever the code runs: the server runs in UTC
export const APP_TIME_ZONE = "Europe/Madrid";
const inAppTimeZone = { in: tz(APP_TIME_ZONE) };

// date-fns returns its time zone aware dates, whose toISOString keeps the offset, so they are turned into plain ones
export function startOfAppDay(date: Date): Date {
  return new Date(startOfDay(date, inAppTimeZone));
}

export function endOfAppDay(date: Date): Date {
  return new Date(endOfDay(date, inAppTimeZone));
}

export function addAppDays(date: Date, amount: number): Date {
  return new Date(addDays(date, amount, inAppTimeZone));
}

export function isSameAppDay(date: Date, otherDate: Date): boolean {
  return isSameDay(date, otherDate, inAppTimeZone);
}

export function formatAppDate(date: Date, pattern: string): string {
  return format(date, pattern, inAppTimeZone);
}
