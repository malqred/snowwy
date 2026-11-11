import * as SQLite from 'expo-sqlite';

import type { RunPiste, Session, Totals, TrackPoint, Weather } from './types';

const DB_NAME = 'snowwy.db';
const db = SQLite.openDatabaseSync(DB_NAME);

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

// Колонки, которых не было в первых версиях
const columns = new Set(db.getAllSync<{ name: string }>('PRAGMA table_info(sessions)').map((c) => c.name));
if (!columns.has('weather')) db.execSync('ALTER TABLE sessions ADD COLUMN weather TEXT');
if (!columns.has('pistes')) db.execSync('ALTER TABLE sessions ADD COLUMN pistes TEXT');

type SessionRow = {
  id: number;
  started_at: number;
  ended_at: number | null;
  totals: string | null;
  weather?: string | null;
  pistes?: string | null;
};

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totals: parse<Totals>(row.totals),
    weather: parse<Weather>(row.weather),
    pistes: parse<RunPiste[]>(row.pistes),
  };
}

export async function createSession(startedAt: number): Promise<number> {
  const res = await db.runAsync('INSERT INTO sessions (started_at) VALUES (?)', startedAt);
  return res.lastInsertRowId;
}

const CHUNK = 400;

async function insertInto(target: SQLite.SQLiteDatabase, sessionId: number, points: TrackPoint[]): Promise<void> {
  for (let i = 0; i < points.length; i += CHUNK) {
    const chunk = points.slice(i, i + CHUNK);
    const params: number[] = [];
    for (const p of chunk) params.push(sessionId, p.t, p.lat, p.lon, p.alt, p.speed, p.acc);
    await target.runAsync(
      `INSERT INTO points (session_id, t, lat, lon, alt, speed, acc) VALUES ${chunk
        .map(() => '(?,?,?,?,?,?,?)')
        .join(',')}`,
      params
    );
  }
}

export function insertPoints(sessionId: number, points: TrackPoint[]): Promise<void> {
  return insertInto(db, sessionId, points);
}

export async function finishSession(id: number, endedAt: number, totals: Totals): Promise<void> {
  await db.runAsync(
    'UPDATE sessions SET ended_at = ?, totals = ? WHERE id = ?',
    endedAt,
    JSON.stringify(totals),
    id
  );
}

export async function setWeather(id: number, weather: Weather): Promise<void> {
  await db.runAsync('UPDATE sessions SET weather = ? WHERE id = ?', JSON.stringify(weather), id);
}

export async function setPistes(id: number, pistes: RunPiste[]): Promise<void> {
  await db.runAsync('UPDATE sessions SET pistes = ? WHERE id = ?', JSON.stringify(pistes), id);
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

const POINT_COLUMNS = 't, lat, lon, alt, speed, acc';

export async function getPoints(sessionId: number): Promise<TrackPoint[]> {
  return db.getAllAsync<TrackPoint>(`SELECT ${POINT_COLUMNS} FROM points WHERE session_id = ? ORDER BY t`, sessionId);
}

export async function deleteSession(id: number): Promise<void> {
  await db.runAsync('DELETE FROM points WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM sessions WHERE id = ?', id);
}

export async function deleteEverything(): Promise<void> {
  await db.execAsync('DELETE FROM points; DELETE FROM sessions;');
}

/** Папка, где лежат файлы баз данных (путь или адрес file://). */
export const databaseDirectory = SQLite.defaultDatabaseDirectory as string;

/**
 * Снимает полную копию базы в отдельный файл в той же папке.
 * Возвращает путь к файлу копии.
 */
export async function copyDatabaseTo(name: string): Promise<string> {
  await SQLite.deleteDatabaseAsync(name).catch(() => {});
  const copy = await SQLite.openDatabaseAsync(name);
  try {
    await SQLite.backupDatabaseAsync({ sourceDatabase: db, destDatabase: copy });
  } finally {
    await copy.closeAsync();
  }
  return copy.databasePath;
}

export type ImportResult = { added: number; skipped: number };

/**
 * Переносит записи из файла копии (лежит в папке баз данных) в основную базу.
 * Дни, которые уже есть (по времени начала), пропускаются.
 */
export async function importDatabaseFrom(name: string): Promise<ImportResult> {
  const source = await SQLite.openDatabaseAsync(name);
  try {
    const rows = await source.getAllAsync<SessionRow>(
      'SELECT * FROM sessions WHERE ended_at IS NOT NULL ORDER BY started_at'
    );
    const existing = new Set(
      (await db.getAllAsync<{ started_at: number }>('SELECT started_at FROM sessions')).map((r) => r.started_at)
    );
    let added = 0;
    let skipped = 0;
    for (const row of rows) {
      if (existing.has(row.started_at)) {
        skipped++;
        continue;
      }
      const points = await source.getAllAsync<TrackPoint>(
        `SELECT ${POINT_COLUMNS} FROM points WHERE session_id = ? ORDER BY t`,
        row.id
      );
      const res = await db.runAsync(
        'INSERT INTO sessions (started_at, ended_at, totals, weather, pistes) VALUES (?, ?, ?, ?, ?)',
        row.started_at,
        row.ended_at,
        row.totals,
        row.weather ?? null,
        row.pistes ?? null
      );
      try {
        await insertPoints(res.lastInsertRowId, points);
      } catch (e) {
        // Не оставляем день без точек
        await deleteSession(res.lastInsertRowId).catch(() => {});
        throw e;
      }
      added++;
    }
    return { added, skipped };
  } finally {
    await source.closeAsync().catch(() => {});
    await SQLite.deleteDatabaseAsync(name).catch(() => {});
  }
}
