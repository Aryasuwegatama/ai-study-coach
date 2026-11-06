/**
 * IANA time zone validation, shared by the Better Auth field validator and
 * anything else that needs to check a student-supplied time zone (PRD
 * Section 4: "an IANA name such as `Australia/Brisbane`").
 *
 * `Intl.supportedValuesOf("timeZone")` is the Node/browser-native source
 * of truth for valid IANA names — no dependency, no stale list to maintain.
 */
const VALID_TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

export function isValidTimeZone(value: string): boolean {
  return VALID_TIME_ZONES.has(value);
}
