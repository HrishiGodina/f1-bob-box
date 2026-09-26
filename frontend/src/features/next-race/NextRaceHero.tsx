import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { StudioButton } from '../../shared/ui/StudioButton';
import { CircuitTrack3D } from '../../shared/ui/CircuitTrack3D';
import { useIdleData } from '../../shared/api/useIdleData';

interface NextRaceHeroProps {
  onOpenBriefing: () => void;
}

export function NextRaceHero({ onOpenBriefing }: NextRaceHeroProps) {
  const { data: idleData } = useIdleData();

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-20 items-center min-h-[60vh]">
      <div className="lg:col-span-8 space-y-12">
         <div className="flex items-center gap-6 text-accent mb-8 animate-reveal">
            <div className="h-1.5 w-24 bg-accent rounded-full shadow-[0_0_15px_rgba(204,0,0,0.5)]" />
            <span className="text-sm font-black uppercase tracking-[0.6em] italic">Next Transmission Active</span>
         </div>
         <h1 className="text-[8vw] lg:text-[7rem] leading-[1.05] tracking-tight mb-16 animate-reveal">
            {idleData?.next_race?.raceName ? idleData.next_race.raceName.split(' ')[0] : 'UPCOMING'}<br/>
            <span className="text-accent italic">{idleData?.next_race?.raceName?.split(' ').slice(1).join(' ') || 'BATTLE'}</span>
         </h1>
         <div className="flex flex-wrap gap-20 border-t border-white/10 pt-16 animate-reveal" style={{ animationDelay: '0.2s' }}>
            <div className="group cursor-pointer" onClick={onOpenBriefing}>
              <div className="text-[10px] font-black text-muted uppercase tracking-[0.5em] mb-4 group-hover:text-white transition-colors">Tactical Location</div>
              <div className="text-4xl font-black italic text-white uppercase group-hover:text-accent transition-all">{idleData?.next_race?.Circuit?.circuitName}</div>
            </div>
            <div>
              <div className="text-[10px] font-black text-muted uppercase tracking-[0.5em] mb-4">Race Date</div>
              <div className="text-4xl font-black italic text-white uppercase">{idleData?.next_race?.date}</div>
            </div>
            <StudioButton className="w-full md:w-auto px-20 py-8 text-2xl shadow-2xl shadow-accent/40 hover:scale-105" onClick={onOpenBriefing}>
              System Briefing
            </StudioButton>
         </div>
      </div>
      <div className="lg:col-span-4 relative hidden lg:block">
         <motion.div
           className="panel overflow-hidden group border-white/10 rounded-[3rem] bg-surface relative cursor-pointer flex flex-col p-10 gap-4 aspect-square"
           onClick={onOpenBriefing}
           whileHover={{ scale: 1.01 }}
           transition={{ duration: 0.3 }}
         >
            <div className="flex items-start justify-between z-10">
               <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-accent" />
                  <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Circuit Layout</div>
               </div>
               <div className="text-[9px] font-black uppercase tracking-[0.5em] text-accent">Round {idleData?.next_race?.round || '—'}</div>
            </div>

            <div className="flex-1 relative flex items-center justify-center -my-2">
               <CircuitTrack3D circuitId={idleData?.next_race?.Circuit?.circuitId || 'default'} />
            </div>

            <div className="flex items-center justify-between z-10 pt-2 border-t border-white/5">
               <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live Sim
               </div>
               <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">{idleData?.next_race?.date || 'TBD'}</div>
            </div>
         </motion.div>
      </div>
    </section>
  );
}
