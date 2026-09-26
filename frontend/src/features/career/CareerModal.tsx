import { Activity, User, Users } from 'lucide-react';
import { StudioModal } from '../../shared/ui/StudioModal';
import { useCareer } from './useCareer';
import type { components } from '../../shared/api/schema';

type ConstructorRecord = components['schemas']['ConstructorRecord'];

type CareerStatsView = {
  info?: {
    givenName?: string;
    familyName?: string;
    name?: string;
    nationality?: string;
  };
  wins?: string;
  championships?: number;
  career_teams?: ConstructorRecord[];
};

interface CareerModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: 'driver' | 'constructor';
  id?: string;
}

export function CareerModal({ isOpen, onClose, type, id }: CareerModalProps) {
  const { data: stats, isPending } = useCareer(type, id, isOpen);
  const data: CareerStatsView | undefined = stats;

  return (
    <StudioModal isOpen={isOpen} onClose={onClose} title={`${type?.toUpperCase()} PROFILE`}>
      {isPending ? (
        <div className="h-96 flex items-center justify-center">
          <div className="text-mkbhd-red animate-pulse font-black italic text-4xl">LINKING_SATELLITE...</div>
        </div>
      ) : data ? (
        <div className="space-y-12">
          <div className="flex flex-col md:flex-row gap-12 items-center md:items-start">
            <div className="w-48 h-48 bg-mkbhd-black rounded-[3rem] border border-white/10 flex items-center justify-center text-8xl font-black italic text-white/10">
              {type === 'driver' ? <User size={80} /> : <Users size={80} />}
            </div>
            <div className="flex-1 space-y-6 text-center md:text-left">
              <h3 className="text-7xl font-black uppercase italic tracking-tightest leading-none">
                {type === 'driver' ? `${data.info?.givenName} ${data.info?.familyName}` : data.info?.name}
              </h3>
              <div className="flex flex-wrap justify-center md:justify-start gap-6">
                <div className="px-6 py-2 bg-mkbhd-red/20 border border-mkbhd-red/30 rounded-full text-mkbhd-red text-[10px] font-black uppercase tracking-widest">
                  {data.info?.nationality}
                </div>
                <div className="px-6 py-2 bg-white/5 border border-white/10 rounded-full text-mkbhd-gray text-[10px] font-black uppercase tracking-widest">
                  ID: {id}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="mkbhd-card p-12 flex flex-col items-center justify-center bg-white/2">
              <div className="text-8xl font-black italic text-white mb-4">{data.wins}</div>
              <div className="text-[10px] font-black text-mkbhd-gray uppercase tracking-[0.5em]">Career Victories</div>
            </div>
            <div className="mkbhd-card p-12 flex flex-col items-center justify-center bg-mkbhd-red/5">
              <div className="text-8xl font-black italic text-mkbhd-red mb-4">{data.championships}</div>
              <div className="text-[10px] font-black text-mkbhd-gray uppercase tracking-[0.5em]">World Titles</div>
            </div>
          </div>

          {type === 'driver' && data.career_teams && (
            <div className="space-y-8">
              <h4 className="text-xs font-black uppercase tracking-[0.4em] text-mkbhd-gray flex items-center gap-3">
                <Activity size={14} className="text-mkbhd-red" /> Team History
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {data.career_teams.map((t) => (
                  <div key={t.constructorId} className="p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
                    <div className="text-sm font-black uppercase italic">{t.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </StudioModal>
  );
}
