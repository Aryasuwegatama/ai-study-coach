/**
 * Makes a Postgres connection string's SSL mode explicit (issue #8).
 *
 * Neon's URLs use `sslmode=require`. The installed `pg` (8.x) already
 * treats `prefer`, `require` and `verify-ca` as `verify-full` (encrypted,
 * with the server's certificate fully checked), but it logs a security
 * warning: the next major `pg` version will give `require` its weaker
 * libpq meaning (encrypted, certificate not checked). Rewriting those
 * modes to `verify-full` keeps today's behaviour, stops the warning, and
 * means a future `pg` upgrade can't quietly weaken the connection.
 *
 * Done in code rather than in each environment's variable because Vercel's
 * Neon integration injects `DATABASE_URL` itself and creates a fresh one
 * for every Preview deployment, so a hand-edited value wouldn't stick.
 *
 * Only the `sslmode` parameter changes. Every other part of the URL,
 * including the credentials, is left exactly as given. An already-explicit
 * mode such as `verify-full` or `disable` is left alone.
 */
export function withVerifyFullSslMode(connectionString: string): string {
  return connectionString.replace(
    /([?&])sslmode=(?:prefer|require|verify-ca)(?=&|#|$)/,
    "$1sslmode=verify-full",
  );
}
