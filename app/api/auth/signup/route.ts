import { NextResponse } from "next/server";
import { dbConfigured, query } from "@/lib/server/db";
import {
  createSession,
  hashPassword,
  normalizeEmail,
  normalizeNickname,
  randomUUID,
  setSessionCookie,
  validEmail,
  validNickname,
} from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  // 학교/회사 등 공유 IP를 고려해 시간당 20회까지 허용
  if (!rateLimit(`signup:${clientIp(req)}`, 20, 60 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let body: { email?: string; password?: string; nickname?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";
  const nickname = normalizeNickname(body.nickname ?? "");

  if (!validEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }
  if (!validNickname(nickname)) {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }

  const hash = await hashPassword(password);
  const id = randomUUID();
  try {
    await query(
      "INSERT INTO users (id, email, password_hash, nickname) VALUES ($1, $2, $3, $4)",
      [id, email, hash, nickname]
    );
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    throw e;
  }

  const token = await createSession(id);
  await setSessionCookie(token);
  return NextResponse.json({ user: { id, email, nickname } }, { status: 201 });
}
