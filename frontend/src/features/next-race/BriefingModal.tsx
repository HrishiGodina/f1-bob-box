import { StudioModal } from '../../shared/ui/StudioModal';
import { CircuitTrack3D } from '../../shared/ui/CircuitTrack3D';
import { CircuitElevation } from '../../shared/ui/CircuitElevation';
import { useIdleData } from '../../shared/api/useIdleData';

interface BriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BriefingModal({ isOpen, onClose }: BriefingModalProps) {
  const { data: idleData } = useIdleData();
  const nr = idleData?.next_race;
  const circuitId = nr?.Circuit?.circuitId || 'monaco';

  return (
    <StudioModal isOpen={isOpen} onClose={onClose} title="Battle Strategy Briefing">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        <div className="space-y-12">
          <div className="space-y-6">
            <div className="text-accent font-black uppercase tracking-[0.6em] text-sm flex items-center gap-4">
              <div className="h-0.5 w-12 bg-accent" /> Tactical Analysis
            </div>
            <h3 className="text-5xl md:text-6xl lg:text-7xl leading-[0.9] tracking-tighter uppercase italic wrap-break-word">{nr?.raceName}</h3>
          </div>
          <div className="p-10 panel border-l-10 border-accent bg-accent/5 rounded-4xl">
            <p className="text-xl md:text-2xl leading-[1.15] text-white italic font-black uppercase tracking-tight">
              "Peak efficiency required. Aero-balance is the critical metric. Zero compromises in thermal management for this session."
            </p>
          </div>
          <div className="grid grid-cols-3 gap-8">
            <div className="p-8 panel bg-white/1 border border-white/10 rounded-4xl">
              <div className="text-[9px] font-black text-muted uppercase tracking-widest mb-3 italic">Location</div>
              <div className="text-lg font-black italic text-white uppercase leading-tight">{nr?.Circuit?.Location?.locality}</div>
              <div className="text-[9px] text-muted mt-1">{nr?.Circuit?.Location?.country}</div>
            </div>
            <div className="p-8 panel bg-white/1 border border-white/10 rounded-4xl">
              <div className="text-[9px] font-black text-muted uppercase tracking-widest mb-3 italic">Round</div>
              <div className="text-3xl font-black italic text-white">{nr?.round}</div>
            </div>
            <div className="p-8 panel bg-white/1 border border-white/10 rounded-4xl">
              <div className="text-[9px] font-black text-muted uppercase tracking-widest mb-3 italic">Date</div>
              <div className="text-lg font-black italic text-accent uppercase leading-tight">{nr?.date}</div>
            </div>
          </div>
          <CircuitElevation circuitId={circuitId} />
        </div>
        <div className="panel bg-ink flex flex-col items-center justify-center min-h-[500px] relative rounded-[3rem] overflow-hidden border-white/5 shadow-2xl p-8">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)', backgroundSize: '20px 20px' }} />
          <div className="w-full flex-1 relative z-10">
            <CircuitTrack3D circuitId={circuitId} />
          </div>
          <div className="relative z-10 mt-6 text-center space-y-2">
            <div className="text-2xl font-black uppercase italic tracking-tight text-white/80">{nr?.Circuit?.circuitName}</div>
            <div className="text-[10px] font-black uppercase tracking-[0.8em] text-accent animate-pulse">Circuit Layout Active</div>
          </div>
          <div className="absolute inset-0 bg-linear-to-br from-accent/5 via-transparent to-transparent pointer-events-none" />
        </div>
      </div>
    </StudioModal>
  );
}
