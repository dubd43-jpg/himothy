/**
 * Server-side admin auth for mutation endpoints (publish / lock / grade the board).
 *
 * The client-side password gate in the admin UI is cosmetic only — it ships in the
 * browser bundle and does nothing to protect the API. These write endpoints MUST be
 * checked on the server. A request is authorized only if it carries an `x-admin-secret`
 * header matching the ADMIN_SECRET env var. If ADMIN_SECRET is not set, the endpoints
 * are locked down (deny all) — a safe default for a public deployment.
 */
export function isAdminRequest(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) return false; // not configured → locked
  const header = req.headers.get('x-admin-secret');
  return Boolean(header && header === secret);
}

export function adminUnauthorized() {
  return Response.json(
    { success: false, error: 'Unauthorized. Admin actions require a valid ADMIN_SECRET.' },
    { status: 401 },
  );
}
