import { useQuery } from '@tanstack/react-query';
import { apiGet } from './client';
import type { components } from './schema';

type IdleDataResponse = components['schemas']['IdleDataResponse'];

export interface IdleCircuit {
  circuitId?: string;
  circuitName?: string;
  Location?: {
    locality?: string;
    country?: string;
  };
}

export interface IdleNextRace {
  round?: string;
  raceName?: string;
  date?: string;
  Circuit?: IdleCircuit;
}

export type IdleData = Omit<IdleDataResponse, 'next_race'> & {
  next_race: IdleNextRace;
};

export const idleDataPlaceholder: IdleData = {
  driver_standings: [],
  constructor_standings: [],
  news: [],
  schedule: [],
  next_race: { raceName: 'Loading Grand Prix', Circuit: { circuitName: 'Scanning...' }, date: 'TBD' },
};

export function useIdleData() {
  return useQuery<IdleData>({
    queryKey: ['idle-data'],
    queryFn: () => apiGet<IdleData>('/idle-data'),
    placeholderData: idleDataPlaceholder,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    refetchInterval: (query) => (query.state.data === undefined ? 30000 : false),
  });
}
