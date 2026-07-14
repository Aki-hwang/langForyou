import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { query } from "./db";

export const SESSION_COOKIE = "lfy_session";
const SESSION_DAYS = 180;

export interface AuthUser {
  id: string;
  email: string;
  nickname: string | null;
}

/** 별명 규칙: 공백 제거 후 1~12자 */
export function normalizeNickname(nickname: string): string {
  return nickname.trim();
}

export function validNickname(nickname: string): boolean {
  const n = nickname.trim();
  return n.length >= 1 && n.length <= 12;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// 존재하지 않는 계정 로그인 시에도 비슷한 시간이 걸리도록 더미 해시와 비교
const DUMMY_HASH = "$2b$10$C6UzMDM.H6dfI/f/IKcEeO7ZUOX0P8VgeCsyIcO7RZxWKPasvJHhi";

export async function verifyPassword(
  password: string,
  hash: string | null
): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID() + randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
    [token, userId, expires.toISOString()]
  );
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

/** 쿠키의 세션 토큰으로 로그인 사용자 조회 (없으면 null) */
export async function getSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await query<AuthUser>(
    `SELECT u.id, u.email, u.nickname FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  return rows[0] ?? null;
}

export async function deleteCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token = $1", [token]);
}

export { randomUUID };
