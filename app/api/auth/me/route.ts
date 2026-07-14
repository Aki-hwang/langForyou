import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/server/db";
import { getSessionUser } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ user: null, dbConfigured: false });
  }
  try {
    const user = await getSessionUser();
    return NextResponse.json({ user, dbConfigured: true });
  } catch {
    return NextResponse.json(
      { user: null, dbConfigured: true, error: "db_error" },
      { status: 500 }
    );
  }
}
