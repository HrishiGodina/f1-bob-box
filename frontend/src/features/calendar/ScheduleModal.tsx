import { Play } from 'lucide-react';
import { StudioModal } from '../../shared/ui/StudioModal';
import { useIdleData } from '../../shared/api/useIdleData';
import type { CircuitSummary } from './types';

export interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCircuit: (circuit: CircuitSummary) => void;
}

export function ScheduleModal({ isOpen, onClose, onSelectCircuit }: ScheduleModalProps) {
  const { data: idleData } = useIdleData();
  return (
    <StudioModal isOpen={isOpen} onClose={onClose} title="Season Matrix Timeline">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {idleData?.schedule?.map((race) => (
          <div key={race.round} className="mkbhd-card p-16 bg-white/1 hover:border-mkbhd-red transition-all group rounded-[4rem] relative overflow-hidden">
            <div className="text-white/5 font-black italic text-[10rem] absolute -right-8 -top-8 group-hover:text-mkbhd-red/10 transition-colors">#{race.round.padStart(2, '0')}</div>
            <div className="relative z-10">
              <h4 className="text-4xl font-black leading-none mb-6 uppercase italic tracking-tightest">{race.raceName}</h4>
              <div className="text-[13px] font-black text-mkbhd-gray uppercase tracking-[0.5em] mb-20 group-hover:text-white transition-colors">{race.Circuit.circuitName}</div>
              <div className="flex justify-between items-end pt-12 border-t border-white/10">
                <div className="space-y-3">
                  <div className="text-[10px] font-black text-mkbhd-red uppercase tracking-[0.3em]">Race Date</div>
                  <div className="text-xl font-black text-white italic tracking-widest">{race.date}</div>
                </div>
                <button onClick={() => { onSelectCircuit(race.Circuit); onClose(); }} className="p-5 bg-white/5 rounded-3xl hover:bg-mkbhd-red transition-all hover:scale-110 z-20 relative text-white">
                  <Play size={32} fill="currentColor" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </StudioModal>
  );
}
