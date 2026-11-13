import { sql, type SQL } from "drizzle-orm";

/** The student's IANA time zone, or UTC when unset or unknown. */
export function safeTimeZone(timeZone: string | null): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** The student's local calendar day, plus `days`, as a SQL `date` (dates are never computed in JS). */
export function localDate(timeZone: string | null, days = 0): SQL<string> {
  return sql<string>`((now() at time zone ${safeTimeZone(timeZone)})::date + ${days}::int)`;
}
