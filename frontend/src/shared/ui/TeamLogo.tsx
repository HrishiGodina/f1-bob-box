import { TEAM_COLORS } from '../theme/teamColors';

export const TeamLogo = ({ teamId, className }: { teamId: string; className?: string }) => {
  const team = TEAM_COLORS[teamId] || { color: '#444', short: (teamId || '???').substring(0, 3).toUpperCase() };
  return (
    <div
      className={`rounded-xl flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors overflow-hidden ${className}`}
      style={{ backgroundColor: `${team.color}22` }}
    >
      <div
        className="text-[9px] font-black uppercase italic tracking-wider"
        style={{ color: team.color }}
      >
        {team.short}
      </div>
    </div>
  );
};
