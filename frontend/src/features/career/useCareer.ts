import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../shared/api/client';
import type { components } from '../../shared/api/schema';

type DriverStatsResponse = components['schemas']['DriverStatsResponse'];
type ConstructorStatsResponse = components['schemas']['ConstructorStatsResponse'];

export type CareerStats = DriverStatsResponse | ConstructorStatsResponse;
export type CareerType = 'driver' | 'constructor';

export function useCareer(type: CareerType | undefined, id: string | undefined, isOpen: boolean) {
  return useQuery<CareerStats>({
    queryKey: ['career', type, id],
    queryFn: () => apiGet<CareerStats>(`/${type}/${id}/stats`),
    enabled: isOpen && !!type && !!id,
    retry: false,
  });
}
