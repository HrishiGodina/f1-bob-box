import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { StudioButton } from '../../shared/ui/StudioButton';
import { TeamLogo } from '../../shared/ui/TeamLogo';
import { useIdleData } from '../../shared/api/useIdleData';
import type { components } from '../../shared/api/schema';

type DriverStanding = components['schemas']['DriverStanding'];
type ConstructorStanding = components['schemas']['ConstructorStanding'];
type StandingRow = DriverStanding | ConstructorStanding;

const isDriverStanding = (s: StandingRow): s is DriverStanding => 'Driver' in s;

interface StandingsSectionProps {
  onOpenArchive: () => void;
  onSelectProfile: (type: 'driver' | 'constructor', id: string) => void;
}

export function StandingsSection({ onOpenArchive, onSelectProfile }: StandingsSectionProps) {
  const { data: idleData } = useIdleData();
  const [standingsType, setStandingsType] = useState<'drivers' | 'teams'>('drivers');

  return (
    <section id="standings">
      <div className="mkbhd-card p-12 bg-white/1 flex flex-col border-white/10 rounded-[2.5rem]">
         <div className="flex flex-col md:flex-row md:items-center gap-6 mb-12">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/5 rounded-2xl text-mkbhd-red"><Trophy size={24} /></div>
              <h2 className="text-lg font-black uppercase tracking-widest italic text-white">World Championship</h2>
            </div>
            <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 self-start">
              {(['drivers', 'teams'] as const).map(type => (
                <button key={type} onClick={() => setStandingsType(type)} className={`px-6 py-2.5 text-[10px] font-black uppercase transition-all rounded-xl ${standingsType === type ? 'bg-mkbhd-red text-white shadow-lg shadow-mkbhd-red/20' : 'text-mkbhd-gray hover:text-white'}`}>{type}</button>
              ))}
            </div>
            <div className="md:ml-auto">
              <StudioButton variant="secondary" className="px-8 py-4 text-xs tracking-[0.5em]" onClick={() => onOpenArchive()}>SEASON STANDINGS</StudioButton>
            </div>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-12 gap-y-4">
            {(standingsType === 'drivers' ? idleData?.driver_standings : idleData?.constructor_standings)?.slice(0, 12).map((s, i) => {
              const entityId = isDriverStanding(s) ? s.Driver.driverId : s.Constructor.constructorId;
              const teamId = isDriverStanding(s) ? s.Constructors?.[0]?.constructorId : entityId;
              return (
                <motion.div key={i} whileHover={{ x: 6 }} onClick={() => onSelectProfile(standingsType === 'drivers' ? 'driver' : 'constructor', entityId)} className="flex items-center gap-4 group cursor-pointer border-b border-white/3 py-5 last:border-0">
                   <span className="text-2xl font-black italic text-white/5 group-hover:text-mkbhd-red transition-all w-8 shrink-0">{(i+1).toString().padStart(2, '0')}</span>
                   <TeamLogo teamId={teamId} className="w-10 h-10 shrink-0" />
                   <div className="flex-1 min-w-0">
                      <div className="text-lg font-black uppercase text-white group-hover:text-mkbhd-red transition-all italic tracking-tight truncate">{isDriverStanding(s) ? s.Driver.familyName : s.Constructor.name}</div>
                      <div className="text-[9px] font-bold text-mkbhd-gray uppercase tracking-[0.35em] italic opacity-50 truncate">{isDriverStanding(s) ? s.Driver.nationality : s.Constructor.nationality}</div>
                   </div>
                   <div className="text-right shrink-0 flex items-baseline gap-1.5">
                      <span className="text-xl font-black text-white italic leading-none">{s.points}</span>
                      <span className="text-[9px] font-black text-mkbhd-red uppercase tracking-wider">PTS</span>
                   </div>
                </motion.div>
              );
            })}
         </div>
      </div>
    </section>
  );
}
