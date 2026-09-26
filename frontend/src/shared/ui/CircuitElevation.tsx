import { useMemo } from 'react';
import { AreaChart, Area, YAxis, ResponsiveContainer } from 'recharts';

export const CircuitElevation = ({ circuitId }: { circuitId: string }) => {
  const data = useMemo(() => {
    const count = 40;
    const base = circuitId?.includes('monaco') ? 20 : circuitId?.includes('spa') ? 60 : 10;
    return Array.from({ length: count + 1 }, (_, i) => ({
      x: i,
      y: base + Math.sin(i / 3) * (base / 2) + (i % 7) * 0.8
    }));
  }, [circuitId]);

  return (
    <div className="h-28 w-full bg-white/2 rounded-2xl border border-white/5 relative overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#cc0000" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#cc0000" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="y" stroke="#cc0000" fill="url(#elevGrad)" strokeWidth={2} isAnimationActive={true} dot={false} />
          <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
