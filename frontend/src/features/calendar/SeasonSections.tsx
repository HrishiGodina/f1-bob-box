import { useIdleData } from '../../shared/api/useIdleData';
import { CompletedSeason } from './CompletedSeason';
import { UpcomingRaces } from './UpcomingRaces';
import type { CircuitSummary } from './types';

export interface SeasonSectionsProps {
  onSelectCircuit: (circuit: CircuitSummary) => void;
}

export function SeasonSections({ onSelectCircuit }: SeasonSectionsProps) {
  const { data: idleData } = useIdleData();
  const today = new Date().toISOString().slice(0, 10);
  const completed = idleData?.schedule?.filter((r) => r.date < today) || [];
  const upcoming = idleData?.schedule?.filter((r) => r.date >= today) || [];
  return (
    <>
      {completed.length > 0 && <CompletedSeason races={completed} onSelectCircuit={onSelectCircuit} />}
      {upcoming.length > 0 && <UpcomingRaces races={upcoming} onSelectCircuit={onSelectCircuit} />}
    </>
  );
}
