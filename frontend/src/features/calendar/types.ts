import type { components } from '../../shared/api/schema';

export interface CircuitSummary {
  circuitId: string;
  circuitName?: string;
  Location?: {
    locality?: string;
    country?: string;
  };
}

export type ScheduleRace = components['schemas']['ScheduledRace'];
