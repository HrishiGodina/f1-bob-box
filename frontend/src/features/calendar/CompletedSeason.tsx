import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import { SectionHeader } from '../../shared/ui/SectionHeader';
import type { CircuitSummary, ScheduleRace } from './types';

export interface CompletedSeasonProps {
  races: ScheduleRace[];
  onSelectCircuit: (circuit: CircuitSummary) => void;
}

export function CompletedSeason({ races, onSelectCircuit }: CompletedSeasonProps) {
  return (
    <section className="space-y-12">
      <SectionHeader icon={Flag} title="This Season" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {races.map((race, i) => (
          <motion.div
            key={i} whileHover={{ scale: 1.02 }}
            onClick={() => { onSelectCircuit(race.Circuit); }}
            className="panel p-10 bg-white/1 border-white/10 group hover:border-accent transition-all rounded-[2.5rem] relative overflow-hidden cursor-pointer"
          >
            <div className="absolute -right-6 -top-6 text-white/5 font-black text-8xl italic group-hover:text-accent/10 transition-colors">#{race.round}</div>
            <h4 className="text-2xl font-black leading-tight mb-4 uppercase italic tracking-tighter">{race.raceName}</h4>
            <div className="text-[11px] font-black text-muted uppercase tracking-[0.4em] mb-8 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" /> {race.Circuit?.Location?.country}
            </div>
            <div className="text-xs font-black text-white flex items-center justify-between pt-6 border-t border-white/10">
              <span className="italic tracking-widest">{race.date}</span>
              <div className="p-2 bg-accent/10 rounded-xl text-accent text-[9px] font-black uppercase tracking-widest">RESULTS</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
