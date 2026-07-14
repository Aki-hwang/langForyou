import { NextResponse } from "next/server";
import { dbConfigured, query } from "@/lib/server/db";
import {
  createSession,
  normalizeEmail,
  setSessionCookie,
  verifyPassword,
} from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";

  const { rows } = await query<{ id: string; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? null);
  if (!ok) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await createSession(user.id);
  await setSessionCookie(token);
  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
