// Shared admin user-creation logic (not a route — leading underscore).
// Used by api/create-user.js (Vercel) and the Vite dev middleware.
// Requires the SERVICE ROLE key, so this only ever runs server-side.
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || "salman@ladderglobal.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

// Readable but strong temp password, e.g. "Kx7-Rм..." — guarantees a mix.
function genPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const all = upper + lower + digit;
  const pick = (set) => set[crypto.randomInt(set.length)];
  let pw = pick(upper) + pick(lower) + pick(digit);
  for (let i = 0; i < 9; i++) pw += pick(all);
  return pw;
}

// Returns { status, body } so callers just forward it.
export async function createUserCore({ token, email, role }) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return { status: 500, body: { ok: false, error: "User management is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." } };
  }
  if (!token) return { status: 401, body: { ok: false, error: "Not authenticated." } };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return { status: 400, body: { ok: false, error: "A valid email address is required." } };
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the caller's session and that they are an admin.
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) {
    return { status: 401, body: { ok: false, error: "Invalid session." } };
  }
  if (!adminEmails().includes((caller.user.email || "").toLowerCase())) {
    return { status: 403, body: { ok: false, error: "Only an admin can create users." } };
  }

  const password = genPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: role ? { role } : {},
  });
  if (error) return { status: 400, body: { ok: false, error: error.message } };

  return { status: 200, body: { ok: true, email: data.user.email, password } };
}
