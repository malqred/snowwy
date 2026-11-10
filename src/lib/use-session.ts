import { useEffect, useState } from 'react';

import { analyze } from './analyze';
import { getPoints, getSession } from './db';
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
        if (active) setData(result);
      });
    return () => {
      active = false;
    };
  }, [id]);

  return data;
}
