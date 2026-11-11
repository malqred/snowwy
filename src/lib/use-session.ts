import { useEffect, useState } from 'react';

import { analyze } from './analyze';
import { getPoints, getSession, setPistes } from './db';
import { fetchWays, matchRuns } from './pistes';
import type { Analysis, Session, TrackPoint } from './types';

export type SessionData = {
  session: Session;
  points: TrackPoint[];
  analysis: Analysis;
};

/**
 * Загружает запись и заново находит в ней спуски.
 * undefined — ещё грузится, null — записи нет.
 */
export function useSession(id: number): SessionData | null | undefined {
  const [data, setData] = useState<SessionData | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    (async () => {
      const session = await getSession(id);
      if (!session) return null;
      const points = await getPoints(id);
      return { session, points, analysis: analyze(points) };
    })()
      .catch(() => null)
      .then((result) => {
        if (!active) return;
        setData(result);
        // Названия трасс подгружаются из интернета один раз и сохраняются в записи
        if (!result || result.session.pistes != null || result.session.endedAt == null) return;
        const runs = result.analysis.segments.filter((s) => s.kind === 'run');
        if (runs.length === 0) return;
        fetchWays(result.points)
          .then((ways) => {
            if (!ways) return;
            const pistes = matchRuns(result.points, runs, ways);
            setPistes(id, pistes).catch(() => {});
            if (active) setData({ ...result, session: { ...result.session, pistes } });
          })
          .catch(() => {});
      });
    return () => {
      active = false;
    };
  }, [id]);

  return data;
}
