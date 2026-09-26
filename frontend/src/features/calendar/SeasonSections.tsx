import { useIdleData } from '../../shared/api/useIdleData';
import { CompletedSeason } from './CompletedSeason';
import { UpcomingRaces } from './UpcomingRaces';
import type { CircuitSummary, ScheduleRace } from './types';

export interface SeasonSectionsProps {
  onSelectCircuit: (circuit: CircuitSummary) => void;
}

export function SeasonSections({ onSelectCircuit }: SeasonSectionsProps) {
  const { data: idleData } = useIdleData();
  const now = Date.now();
  const raceStart = (race: ScheduleRace): number =>
    Date.parse(`${race.date}T${typeof race.time === 'string' ? race.time : '00:00:00Z'}`);
  const schedule = idleData?.schedule || [];
  const completed = schedule.filter((r) => raceStart(r) <= now);
  const upcoming = schedule.filter((r) => raceStart(r) > now);
  return (
    <>
      {completed.length > 0 && <CompletedSeason races={completed} onSelectCircuit={onSelectCircuit} />}
      {upcoming.length > 0 && <UpcomingRaces races={upcoming} onSelectCircuit={onSelectCircuit} />}
    </>
  );
}
