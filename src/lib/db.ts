import * as SQLite from 'expo-sqlite';

import type { Session, Totals, TrackPoint } from './types';

const db = SQLite.openDatabaseSync('snowwy.db');

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    totals TEXT
  );
  CREATE TABLE IF NOT EXISTS points (
    session_id INTEGER NOT NULL,
    t INTEGER NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    alt REAL NOT NULL,
    speed REAL NOT NULL,
    acc REAL NOT NULL
  );
  CREATE INDEX IF NOT EXISTS points_session ON points (session_id, t);
`);

type SessionRow = { id: number; started_at: number; ended_at: number | null; totals: string | null };

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totals: row.totals ? (JSON.parse(row.totals) as Totals) : null,
  };
}

export async function createSession(startedAt: number): Promise<number> {
  const res = await db.runAsync('INSERT INTO sessions (started_at) VALUES (?)', startedAt);
  return res.lastInsertRowId;
}

const CHUNK = 400;

export async function insertPoints(sessionId: number, points: TrackPoint[]): Promise<void> {
  for (let i = 0; i < points.length; i += CHUNK) {
    const chunk = points.slice(i, i + CHUNK);
    const params: number[] = [];
    for (const p of chunk) params.push(sessionId, p.t, p.lat, p.lon, p.alt, p.speed, p.acc);
    await db.runAsync(
      `INSERT INTO points (session_id, t, lat, lon, alt, speed, acc) VALUES ${chunk
        .map(() => '(?,?,?,?,?,?,?)')
        .join(',')}`,
      params
    );
  }
}

export async function finishSession(id: number, endedAt: number, totals: Totals): Promise<void> {
  await db.runAsync(
    'UPDATE sessions SET ended_at = ?, totals = ? WHERE id = ?',
    endedAt,
    JSON.stringify(totals),
    id
  );
}

/** Завершённые записи, новые сверху. */
export async function listSessions(): Promise<Session[]> {
  const rows = await db.getAllAsync<SessionRow>(
    'SELECT * FROM sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC'
  );
  return rows.map(toSession);
}

export async function listUnfinished(): Promise<Session[]> {
  const rows = await db.getAllAsync<SessionRow>('SELECT * FROM sessions WHERE ended_at IS NULL');
  return rows.map(toSession);
}

export async function getSession(id: number): Promise<Session | null> {
  const row = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', id);
  return row ? toSession(row) : null;
}

export async function getPoints(sessionId: number): Promise<TrackPoint[]> {
  return db.getAllAsync<TrackPoint>(
    'SELECT t, lat, lon, alt, speed, acc FROM points WHERE session_id = ? ORDER BY t',
    sessionId
  );
}

export async function deleteSession(id: number): Promise<void> {
  await db.runAsync('DELETE FROM points WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
}

export async function deleteEverything(): Promise<void> {
  await db.execAsync('DELETE FROM points; DELETE FROM sessions;');
}
