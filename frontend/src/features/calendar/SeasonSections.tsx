import { useEffect, useState } from 'react';
import { useIdleData } from '../../shared/api/useIdleData';
import { CompletedSeason } from './CompletedSeason';
import { UpcomingRaces } from './UpcomingRaces';
import type { CircuitSummary, ScheduleRace } from './types';

export interface SeasonSectionsProps {
  onSelectCircuit: (circuit: CircuitSummary) => void;
}

export function SeasonSections({ onSelectCircuit }: SeasonSectionsProps) {
  const { data: idleData } = useIdleData();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const raceStart = (race: ScheduleRace): number =>
    Date.parse(`${race.date}T${typeof race.time === 'string' ? race.time : '00:00:00Z'}`);
  const schedule = idleData?.schedule || [];
  const completed = now === null ? [] : schedule.filter((r) => raceStart(r) <= now);
  const upcoming = now === null ? [] : schedule.filter((r) => raceStart(r) > now);
  return (
    <>
      {completed.length > 0 && <CompletedSeason races={completed} onSelectCircuit={onSelectCircuit} />}
      {upcoming.length > 0 && <UpcomingRaces races={upcoming} onSelectCircuit={onSelectCircuit} />}
    </>
  );
}
