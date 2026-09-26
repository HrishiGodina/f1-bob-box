import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { SectionHeader } from '../../shared/ui/SectionHeader';
import type { CircuitSummary, ScheduleRace } from './types';

export interface UpcomingRacesProps {
  races: ScheduleRace[];
  onSelectCircuit: (circuit: CircuitSummary) => void;
}

export function UpcomingRaces({ races, onSelectCircuit }: UpcomingRacesProps) {
  return (
    <section className="space-y-12" id="archive">
      <SectionHeader icon={MapPin} title="Upcoming Races" />
      <div className="flex gap-8 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
        {races.map((race, i) => (
          <motion.div key={i} whileHover={{ scale: 1.02 }} onClick={() => onSelectCircuit(race.Circuit)} className="panel p-14 bg-white/1 border-white/10 group hover:border-accent transition-all rounded-[3rem] relative overflow-hidden shrink-0 w-72 cursor-pointer">
            <div className="absolute -right-8 -top-8 text-white/5 font-black text-9xl italic group-hover:text-accent/10 transition-colors">#{race.round}</div>
            <h4 className="text-4xl font-black leading-tight mb-6 uppercase italic tracking-tighter">{race.raceName}</h4>
            <div className="text-[12px] font-black text-muted uppercase tracking-[0.4em] mb-16 flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" /> {race.Circuit?.Location?.country}
            </div>
            <div className="text-xs font-black text-white flex items-center justify-between pt-10 border-t border-white/10">
              <span className="italic tracking-widest">{race.date}</span>
              <div className="p-3 bg-white/5 rounded-full group-hover:bg-accent transition-colors">
                <MapPin size={24} className="group-hover:text-white transition-colors" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
