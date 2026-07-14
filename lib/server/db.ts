import { Pool } from "pg";

/**
 * PostgreSQL 커넥션 풀 (Railway Postgres).
 * - DATABASE_URL 환경 변수 필요. 없으면 dbConfigured()가 false를 반환하고
 *   API는 503을 돌려주며, 앱은 비로그인(기기 저장) 모드로 계속 동작한다.
 * - 스키마는 첫 쿼리 전에 1회 자동 생성(CREATE TABLE IF NOT EXISTS).
 */

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!;
    // Railway 내부 네트워크(.internal)와 로컬은 SSL 불필요, 외부 URL은 SSL
    const needSsl =
      !url.includes(".internal") &&
      !url.includes("localhost") &&
      !url.includes("127.0.0.1");
    pool = new Pool({
      connectionString: url,
      ssl: needSsl ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }
  return pool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS progress_cards (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL,
  streak INT NOT NULL,
  interval_days REAL NOT NULL,
  ease REAL NOT NULL,
  due_at BIGINT NOT NULL,
  last_reviewed_at BIGINT NOT NULL,
  reps INT NOT NULL,
  lapses INT NOT NULL,
  PRIMARY KEY (user_id, word_id)
);
CREATE TABLE IF NOT EXISTS progress_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  reviews INT NOT NULL,
  correct INT NOT NULL,
  PRIMARY KEY (user_id, day)
);
`;

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null; // 다음 요청에서 재시도
        throw e;
      });
  }
  return schemaReady;
}

export async function query<R>(
  text: string,
  params?: unknown[]
): Promise<{ rows: R[]; rowCount: number }> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
}
