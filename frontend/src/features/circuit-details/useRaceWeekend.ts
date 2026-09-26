import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../shared/api/client';

export type SessionKey = 'race' | 'quali' | 'sprint' | 'fp1' | 'fp2' | 'fp3';

export interface RaceWeekendResultRow {
  position?: string | null;
  driver_id?: string | null;
  family_name?: string | null;
  team?: string | null;
  time?: string | null;
  is_finished?: boolean;
}

export interface RaceWeekendEntry {
  results: RaceWeekendResultRow[];
  available: boolean;
}

export const emptyRaceWeekend: RaceWeekendEntry = { results: [], available: false };

export const raceWeekendQueryKey = (circuitId: string, year: number | null, session: string) =>
  ['raceWeekend', circuitId, year, session] as const;

const FP_SESSIONS: SessionKey[] = ['fp1', 'fp2', 'fp3'];

export function useRaceWeekend(circuitId: string, year: number | null, session: SessionKey, enabled: boolean) {
  const fpShortCircuit = enabled && year !== null && year < 2023 && FP_SESSIONS.includes(session);
  const query = useQuery<RaceWeekendEntry>({
    queryKey: raceWeekendQueryKey(circuitId, year, session),
    queryFn: async () => {
      try {
        return await apiGet<RaceWeekendEntry>(`/race-weekend/${circuitId}?year=${year}&session=${session}`);
      } catch {
        return emptyRaceWeekend;
      }
    },
    enabled: enabled && !fpShortCircuit,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return {
    currentSession: fpShortCircuit ? emptyRaceWeekend : query.data,
    sessionLoading: !fpShortCircuit && query.isLoading,
  };
}
