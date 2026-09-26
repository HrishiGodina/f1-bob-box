import { useQuery } from '@tanstack/react-query';
import { apiGet } from './client';
import type { components } from './schema';

export type LiveStatus = components['schemas']['StatusResponse'];

export function useLiveStatus() {
  return useQuery<LiveStatus>({
    queryKey: ['status'],
    queryFn: () => apiGet<LiveStatus>('/status'),
    refetchInterval: 30000,
    retry: false,
  });
}
