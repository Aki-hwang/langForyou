import { NextResponse } from "next/server";
import { dbConfigured, query } from "@/lib/server/db";
import {
  getSessionUser,
  normalizeNickname,
  validNickname,
} from "@/lib/server/auth";

export const runtime = "nodejs";

/** 별명 설정/변경 */
export async function POST(req: Request) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { nickname?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const nickname = normalizeNickname(body.nickname ?? "");
  if (!validNickname(nickname)) {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }

  await query("UPDATE users SET nickname = $1 WHERE id = $2", [
    nickname,
    user.id,
  ]);
  return NextResponse.json({
    user: { id: user.id, email: user.email, nickname },
  });
}
