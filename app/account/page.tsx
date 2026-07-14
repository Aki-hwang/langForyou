"use client";

import { useState } from "react";
import { login, logout, signup, updateNickname, useAuth } from "@/lib/authStore";
import { fullSync, useSyncInfo } from "@/lib/sync";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않아요.",
  email_taken: "이미 가입된 이메일이에요. 로그인해 주세요.",
  weak_password: "비밀번호는 6자 이상으로 해주세요.",
  invalid_email: "이메일 형식을 확인해 주세요.",
  invalid_nickname: "별명은 1~12자로 해주세요.",
  db_not_configured:
    "서버에 데이터베이스가 아직 연결되지 않았어요. (Railway에서 PostgreSQL 추가 필요)",
  network: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
  unknown: "문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export default function AccountPage() {
  const { user, dbConfigured } = useAuth();
  const sync = useSyncInfo();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 별명 수정 (로그인 상태)
  const [editingNick, setEditingNick] = useState(false);
  const [newNick, setNewNick] = useState("");
  const [nickError, setNickError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result =
      mode === "login"
        ? await login(email, password)
        : await signup(email, password, nickname);
    if (!result.ok) {
      setError(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.unknown);
    }
    setBusy(false);
  }

  async function saveNickname(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNickError(null);
    const result = await updateNickname(newNick);
    if (result.ok) {
      setEditingNick(false);
    } else {
      setNickError(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.unknown);
    }
    setBusy(false);
  }

  // 로딩 중
  if (user === undefined) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted">
        확인 중...
      </div>
    );
  }

  // 로그인 상태
  if (user) {
    return (
      <div className="animate-pop-in space-y-5">
        <header className="pt-2">
          <h1 className="text-2xl font-bold tracking-tight">내 계정</h1>
          <p className="mt-1 text-sm text-muted">
            학습 기록이 계정에 자동 저장돼요
          </p>
        </header>

        <div className="rounded-2xl border border-border-soft bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500/10 text-lg">
              👤
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate font-semibold">
                  {user.nickname ?? "별명 없음"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingNick((v) => !v);
                    setNewNick(user.nickname ?? "");
                    setNickError(null);
                  }}
                  className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                >
                  {editingNick ? "취소" : "수정"}
                </button>
              </div>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <p className="mt-0.5 text-xs text-muted">
                {sync.syncing
                  ? "동기화 중..."
                  : sync.error
                    ? "동기화 실패 — 자동으로 다시 시도해요"
                    : sync.lastSyncAt
                      ? `마지막 동기화 ${formatTime(sync.lastSyncAt)}`
                      : "동기화 대기 중"}
              </p>
            </div>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                sync.error
                  ? "bg-amber-400"
                  : sync.syncing
                    ? "bg-sky-400"
                    : "bg-emerald-500"
              }`}
              aria-hidden
            />
          </div>

          {editingNick && (
            <form onSubmit={saveNickname} className="mt-3 flex gap-2">
              <input
                type="text"
                required
                maxLength={12}
                placeholder="별명 (1~12자)"
                value={newNick}
                onChange={(e) => setNewNick(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-border-soft bg-background px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              />
              <button
                type="submit"
                disabled={busy}
                className="shrink-0 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                저장
              </button>
            </form>
          )}
          {nickError && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              {nickError}
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-indigo-500/5 p-4 text-xs leading-relaxed text-muted">
          다른 기기에서도 같은 계정으로 로그인하면 학습 기록(진도·복습
          일정·통계)이 자동으로 합쳐져요.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void fullSync()}
            disabled={sync.syncing}
            className="rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            지금 동기화
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-2xl border border-border-soft bg-card py-3.5 text-sm font-semibold transition active:scale-[0.98]"
          >
            로그아웃
          </button>
        </div>

        <p className="text-center text-[11px] leading-relaxed text-muted">
          로그아웃해도 이 기기의 기록은 남아 있어요.
        </p>
      </div>
    );
  }

  // 비로그인 — 로그인/회원가입 폼
  return (
    <div className="animate-pop-in space-y-5">
      <header className="pt-2">
        <h1 className="text-2xl font-bold tracking-tight">계정</h1>
        <p className="mt-1 text-sm text-muted">
          로그인하면 학습 기록이 계정에 저장되고, 다른 기기와 동기화돼요
        </p>
      </header>

      {!dbConfigured && (
        <p className="rounded-2xl bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          {ERROR_MESSAGES.db_not_configured}
        </p>
      )}

      {/* 모드 전환 */}
      <div className="flex rounded-2xl bg-foreground/5 p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              mode === m ? "bg-card shadow-sm" : "text-muted"
            }`}
          >
            {m === "login" ? "로그인" : "회원가입"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <input
            type="text"
            required
            maxLength={12}
            autoComplete="nickname"
            placeholder="별명 (1~12자, 예: 아키)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-2xl border border-border-soft bg-card px-4 py-3.5 text-[15px] outline-none focus:border-indigo-400"
          />
        )}
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-border-soft bg-card px-4 py-3.5 text-[15px] outline-none focus:border-indigo-400"
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="비밀번호 (6자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-2xl border border-border-soft bg-card px-4 py-3.5 text-[15px] outline-none focus:border-indigo-400"
        />

        {error && (
          <p className="rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-indigo-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "처리 중..." : mode === "login" ? "로그인" : "가입하고 시작하기"}
        </button>
      </form>

      <p className="text-center text-[11px] leading-relaxed text-muted">
        가입 시 이 기기에 있던 학습 기록이 계정으로 옮겨져요.
      </p>
    </div>
  );
}
