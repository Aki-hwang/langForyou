"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fullSync, setSyncEnabled } from "./sync";

export interface User {
  id: string;
  email: string;
}

export interface AuthState {
  /** undefined = 확인 중, null = 비로그인 */
  user: User | null | undefined;
  /** 서버에 DATABASE_URL이 설정돼 있는지 */
  dbConfigured: boolean;
}

let state: AuthState = { user: undefined, dbConfigured: true };
const SERVER_STATE: AuthState = { user: undefined, dbConfigured: true };
const listeners = new Set<() => void>();

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let fetched = false;

async function refreshMe(): Promise<void> {
  try {
    const r = await fetch("/api/auth/me");
    const j = (await r.json()) as { user?: User | null; dbConfigured?: boolean };
    setState({ user: j.user ?? null, dbConfigured: j.dbConfigured !== false });
  } catch {
    setState({ user: null });
  }
}

export function ensureMe(): void {
  if (!fetched) {
    fetched = true;
    void refreshMe();
  }
}

export function useAuth(): AuthState {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  useEffect(() => {
    ensureMe();
  }, []);
  return s;
}

type AuthResult = { ok: true } | { ok: false; error: string };

async function authRequest(path: string, email: string, password: string): Promise<AuthResult> {
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: j.error ?? "unknown" };
    }
    const j = (await r.json()) as { user: User };
    setState({ user: j.user });
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

export function login(email: string, password: string): Promise<AuthResult> {
  return authRequest("/api/auth/login", email, password);
}

export function signup(email: string, password: string): Promise<AuthResult> {
  return authRequest("/api/auth/signup", email, password);
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // 네트워크 오류여도 로컬 상태는 로그아웃 처리
  }
  setSyncEnabled(false);
  setState({ user: null });
}

export { fullSync };
