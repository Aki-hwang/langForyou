import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/server/db";
import { clearSessionCookie, deleteCurrentSession } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST() {
  if (dbConfigured()) {
    try {
      await deleteCurrentSession();
    } catch {
      // 세션 삭제 실패해도 쿠키는 지운다
    }
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
