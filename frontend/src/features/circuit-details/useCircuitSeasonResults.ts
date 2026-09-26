import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../shared/api/client';

export interface CircuitPrevResultRow {
  position?: number | string;
  status?: string | null;
  Driver?: {
    driverId?: string;
    familyName?: string;
  };
  Constructor?: {
    name?: string;
  };
}

export interface CircuitSeasonResults {
  prev_results: CircuitPrevResultRow[];
}

export function useCircuitSeasonResults(circuitId: string, season: number | null, enabled: boolean) {
  return useQuery<CircuitSeasonResults>({
    queryKey: ['circuit', circuitId, 'season', season],
    queryFn: () => apiGet<CircuitSeasonResults>(`/circuit/${circuitId}?season=${(season ?? 0) + 1}`),
    enabled,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
