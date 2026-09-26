import { Trophy } from 'lucide-react';
import { StudioModal } from '../../shared/ui/StudioModal';
import { TeamLogo } from '../../shared/ui/TeamLogo';
import { useIdleData } from '../../shared/api/useIdleData';
import type { components } from '../../shared/api/schema';

type DriverStanding = components['schemas']['DriverStanding'];
type ConstructorStanding = components['schemas']['ConstructorStanding'];
type StandingRow = DriverStanding | ConstructorStanding;

const isDriverStanding = (s: StandingRow): s is DriverStanding => 'Driver' in s;

interface StandingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProfile: (type: 'driver' | 'constructor', id: string) => void;
}

export function StandingsModal({ isOpen, onClose, onSelectProfile }: StandingsModalProps) {
  const { data: idleData } = useIdleData();
  const sections: { title: string; data: StandingRow[] | undefined; type: 'driver' | 'constructor' }[] = [
    { title: 'Drivers', data: idleData?.driver_standings, type: 'driver' },
    { title: 'Constructors', data: idleData?.constructor_standings, type: 'constructor' },
  ];

  return (
    <StudioModal isOpen={isOpen} onClose={onClose} title="World Championship Archive">
       <div className="grid grid-cols-1 xl:grid-cols-2 gap-24">
          {sections.map((section) => (
            <div key={section.title} className="space-y-12">
               <h3 className="text-4xl font-black italic flex items-center gap-8 text-white uppercase tracking-tighter"><Trophy size={40} className="text-accent" /> {section.title}</h3>
               <div className="panel p-6 bg-white/1 border-white/10 rounded-[3rem] shadow-2xl">
                  <table className="w-full">
                     <colgroup>
                       <col className="w-20" />
                       <col />
                       <col className="w-32" />
                     </colgroup>
                     <thead className="text-[12px] font-black text-muted uppercase border-b border-white/10">
                        <tr>
                          <th className="px-6 py-5 text-left">POS</th>
                          <th className="px-6 py-5 text-left">Driver</th>
                          <th className="px-6 py-5 text-right">Points</th>
                        </tr>
                     </thead>
                     <tbody className="text-lg">
                        {section.data?.map((s) => {
                           const entityId = isDriverStanding(s) ? s.Driver.driverId : s.Constructor.constructorId;
                           const teamId = isDriverStanding(s) ? s.Constructors[0].constructorId : entityId;
                           return (
                             <tr key={entityId} onClick={() => onSelectProfile(section.type, entityId)} className="border-b border-white/3 hover:bg-white/5 cursor-pointer transition-all group">
                                <td className="px-6 py-5 font-black italic text-3xl text-white/20 group-hover:text-accent transition-colors align-middle">{s.position}</td>
                                <td className="px-6 py-5 align-middle">
                                  <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 shrink-0">
                                      <TeamLogo teamId={teamId} className="w-full h-full" />
                                    </div>
                                    <div>
                                      <div className="text-2xl font-black italic uppercase group-hover:text-accent group-hover:translate-x-1 transition-all duration-200">{isDriverStanding(s) ? s.Driver.familyName : s.Constructor.name}</div>
                                      <div className="text-[11px] font-black text-muted uppercase tracking-[0.4em] mt-1">{isDriverStanding(s) ? s.Driver.nationality : s.Constructor.nationality}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-5 text-right font-black italic text-3xl text-white align-middle">{s.points}</td>
                             </tr>
                           );
                        })}
                     </tbody>
                  </table>
               </div>
            </div>
          ))}
       </div>
    </StudioModal>
  );
}
