/**
 * IANA time zone validation, shared by the Better Auth field validator and
 * anything else that needs to check a student-supplied time zone (PRD
 * Section 4: "an IANA name such as `Australia/Brisbane`").
 *
 * Validates by constructing `Intl.DateTimeFormat` with the candidate time
 * zone: the constructor throws a `RangeError` for an unrecognised name and
 * accepts any zone the runtime's ICU data actually supports. This is
 * deliberately not `Intl.supportedValuesOf("timeZone").has(value)` (the
 * previous approach): that list omits `"UTC"` even though `Intl` itself
 * accepts it as a time zone, so a student whose browser reports `"UTC"`
 * was wrongly rejected (flagged in PR #6 review, fixed here in T-01c).
 */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
