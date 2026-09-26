import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../shared/api/client';
import type { components } from '../../shared/api/schema';

export type CircuitDetailsResponse = components['schemas']['CircuitDetailsResponse'];

export function useCircuitDetails(circuitId: string, enabled: boolean) {
  return useQuery<CircuitDetailsResponse>({
    queryKey: ['circuit', circuitId],
    queryFn: () => apiGet<CircuitDetailsResponse>(`/circuit/${circuitId}`),
    enabled,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
