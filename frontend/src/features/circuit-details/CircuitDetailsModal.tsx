import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { StudioModal } from '../../shared/ui/StudioModal';
import { CircuitTrack3D } from '../../shared/ui/CircuitTrack3D';
import { CircuitElevation } from '../../shared/ui/CircuitElevation';
import { useCircuitDetails } from './useCircuitDetails';
import { useCircuitSeasonResults } from './useCircuitSeasonResults';
import { useRaceWeekend, raceWeekendQueryKey } from './useRaceWeekend';
import type { CircuitDetailsResponse } from './useCircuitDetails';
import type { RaceWeekendEntry, SessionKey } from './useRaceWeekend';

export interface CircuitSummary {
  circuitId: string;
  circuitName?: string;
  Location?: {
    locality?: string;
    country?: string;
  };
}

const SESSION_TABS: { key: SessionKey; label: string; fpOnly?: boolean }[] = [
  { key: 'race',   label: 'RACE' },
  { key: 'quali',  label: 'QUALI' },
  { key: 'sprint', label: 'SPRINT' },
  { key: 'fp1',    label: 'FP1', fpOnly: true },
  { key: 'fp2',    label: 'FP2', fpOnly: true },
  { key: 'fp3',    label: 'FP3', fpOnly: true },
];

const YearPicker = ({ years, selectedYear, onChange }: {
  years: number[];
  selectedYear: number | null;
  onChange: (year: number) => void;
}) => years.length > 0 ? (
  <select
    value={selectedYear ?? ''}
    onChange={e => onChange(Number(e.target.value))}
    className="bg-white/10 text-white text-[10px] font-black uppercase tracking-widest border border-white/10 rounded-lg px-3 py-1.5 cursor-pointer focus:outline-hidden focus:border-mkbhd-red"
  >
    {[...years].reverse().map((y: number) => (
      <option key={y} value={y} className="bg-mkbhd-studio text-white">{y}</option>
    ))}
  </select>
) : null;

export const CircuitDetailsModal = ({ isOpen, onClose, circuit, onDriverClick }: {
  isOpen: boolean;
  onClose: () => void;
  circuit: CircuitSummary | null;
  onDriverClick?: (driverId: string) => void;
}) => {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [mainTab, setMainTab] = useState<'circuit' | 'weekend'>('circuit');
  const [sessionTab, setSessionTab] = useState<SessionKey>('race');

  const circuitId = circuit?.circuitId || '';
  const detailsQuery = useCircuitDetails(circuitId, isOpen && !!circuitId);
  const seasonQuery = useCircuitSeasonResults(circuitId, selectedYear, isOpen && !!circuitId && selectedYear !== null);
  const { currentSession, sessionLoading } = useRaceWeekend(
    circuitId,
    selectedYear,
    sessionTab,
    isOpen && !!circuitId && selectedYear !== null && mainTab === 'weekend',
  );
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen && circuitId) {
      queryClient.invalidateQueries({ queryKey: ['raceWeekend', circuitId] });
    }
  }, [isOpen, circuitId, queryClient]);

  const data = detailsQuery.data;
  const resetKey = `${isOpen}-${circuitId}`;
  const [renderedResetKey, setRenderedResetKey] = useState(resetKey);
  if (renderedResetKey !== resetKey) {
    setRenderedResetKey(resetKey);
    setSelectedYear(null);
    setResultsExpanded(false);
    setMainTab('circuit');
    setSessionTab('race');
  }
  const seedSource = isOpen && !!circuitId ? data : undefined;
  const [seededData, setSeededData] = useState<CircuitDetailsResponse | undefined | null>(null);
  if (seededData !== seedSource) {
    setSeededData(seedSource);
    const years = seedSource?.available_years;
    if (years && years.length > 0) setSelectedYear(years[years.length - 1]);
  }

  const loading = detailsQuery.isLoading;
  const error = detailsQuery.isError;
  const yearLoading = seasonQuery.isLoading;
  const yearResults = seasonQuery.data?.prev_results ?? [];
  const visibleSessionTabs = SESSION_TABS.filter(t => !t.fpOnly || (selectedYear !== null && selectedYear >= 2023));
  const availableYears = data?.available_years ?? [];

  return (
    <StudioModal isOpen={isOpen} onClose={onClose} title={`${circuit?.circuitName?.toUpperCase() || 'CIRCUIT'} ANALYSIS`}>
       {loading ? (
         <div className="h-96 flex items-center justify-center text-mkbhd-red animate-pulse font-black italic text-4xl">SATELLITE_SCANNING...</div>
       ) : error ? (
         <div className="h-96 flex items-center justify-center text-mkbhd-gray font-black italic text-2xl">DATA_LINK_FAILED — try again</div>
       ) : data ? (
         <div className="space-y-10">
            <div className="flex items-center gap-4">
              <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10">
                {(['circuit', 'weekend'] as const).map(tab => (
                  <button key={tab} onClick={() => setMainTab(tab)}
                    className={`px-8 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${mainTab === tab ? 'bg-mkbhd-red text-white shadow-lg' : 'text-mkbhd-gray hover:text-white'}`}>
                    {tab === 'circuit' ? 'CIRCUIT' : 'RACE WEEKEND'}
                  </button>
                ))}
              </div>
              <div className="ml-auto">
                <YearPicker
                  years={availableYears}
                  selectedYear={selectedYear}
                  onChange={year => { setSelectedYear(year); setResultsExpanded(false); }}
                />
              </div>
            </div>

            {mainTab === 'circuit' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    {[
                      { label: 'Location', value: `${circuit?.Location?.locality}, ${circuit?.Location?.country}` },
                      { label: 'Corners', value: data.stats.corners },
                      { label: 'Laps', value: data.stats.laps },
                      { label: 'Lap Record', value: data.stats.lap_record }
                    ].map(s => (
                      <div key={s.label} className="mkbhd-card p-8 bg-white/2">
                        <div className="text-[9px] font-black text-mkbhd-gray uppercase tracking-widest mb-3">{s.label}</div>
                        <div className="text-xl font-black italic text-white uppercase">{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <CircuitElevation circuitId={circuitId} />
                  <div className="space-y-8">
                    <h4 className="text-xs font-black uppercase tracking-[0.4em] text-mkbhd-gray flex items-center gap-3">
                      <Zap size={14} className="text-mkbhd-red" /> Team Tactical Upgrades
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {data.upgrades.map(u => (
                        <div key={u.team} className="p-6 bg-white/5 rounded-2xl border border-white/10">
                          <div className="text-[10px] font-black text-white uppercase mb-2">{u.team}</div>
                          <div className="text-sm font-bold text-mkbhd-gray">{u.item}</div>
                          <div className={`text-[8px] font-black uppercase mt-4 px-2 py-0.5 rounded-sm inline-block ${u.impact === 'High' ? 'bg-mkbhd-red text-white' : 'bg-white/10 text-white'}`}>Impact: {u.impact}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-12">
                  <div className="mkbhd-card bg-mkbhd-black flex flex-col items-center justify-center min-h-[260px] relative rounded-[2.5rem] overflow-hidden border-white/5 shadow-2xl p-8">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                    <div className="w-full flex-1 relative z-10">
                      <CircuitTrack3D circuitId={circuitId} />
                    </div>
                    <div className="relative z-10 mt-4 text-center space-y-1">
                      <div className="text-lg font-black uppercase italic tracking-tight text-white/80">{circuit?.circuitName}</div>
                      <div className="text-[9px] font-black uppercase tracking-[0.8em] text-mkbhd-red animate-pulse">Circuit Layout Active</div>
                    </div>
                    <div className="absolute inset-0 bg-linear-to-br from-mkbhd-red/5 via-transparent to-transparent pointer-events-none" />
                  </div>
                  <div className="mkbhd-card p-10 bg-mkbhd-red/5 border-mkbhd-red/20">
                    <div className="flex items-center justify-between mb-8">
                      <h4 className="text-xs font-black uppercase tracking-[0.4em] text-mkbhd-red">Race Results</h4>
                    </div>
                    <div className="space-y-4">
                      {yearLoading ? (
                        <div className="text-mkbhd-red animate-pulse font-black italic text-sm">LOADING...</div>
                      ) : yearResults.length > 0 ? (
                        <>
                          {(resultsExpanded ? yearResults : yearResults.slice(0, 5)).map(r => {
                            const isFinished = !r.status || r.status.toLowerCase().startsWith('finished') || /^\+\d+ Lap/.test(r.status);
                            return (
                              <div key={r.Driver?.driverId || r.position} onClick={() => onDriverClick?.(r.Driver?.driverId as string)} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 cursor-pointer hover:bg-white/5 rounded-lg px-2 -mx-2 transition-colors group">
                                <div className="flex items-center gap-4">
                                  <span className="text-xl font-black italic text-white/20 group-hover:text-mkbhd-red transition-colors">{isFinished ? `P${r.position}` : 'DNF'}</span>
                                  <div className="font-black uppercase italic text-sm group-hover:text-mkbhd-red transition-colors">{r.Driver?.familyName}</div>
                                </div>
                                <div className="text-[10px] font-bold text-mkbhd-gray">{r.Constructor?.name}</div>
                              </div>
                            );
                          })}
                          {yearResults.length > 5 && (
                            <button onClick={() => setResultsExpanded(e => !e)} className="w-full text-[10px] font-black uppercase tracking-widest text-mkbhd-gray hover:text-white transition-colors pt-2">
                              {resultsExpanded ? '▲ SHOW LESS' : `▼ SHOW ALL ${yearResults.length} RESULTS`}
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-mkbhd-gray italic text-sm">
                          {data.available_years?.length === 0 ? 'No historical data' : 'NO DATA'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-8 mkbhd-card bg-white/1 italic text-sm leading-relaxed text-mkbhd-gray border-dashed border-white/10">
                    <span className="text-white font-black not-italic block mb-4 uppercase tracking-widest text-[10px]">Strategic Intel:</span>
                    "The high-downforce nature of this circuit demands maximum efficiency from the front wing. Thermal degradation on the rear-left is the primary performance bottleneck."
                  </div>
                </div>
              </div>
            )}

            {mainTab === 'weekend' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="mkbhd-card bg-mkbhd-black flex flex-col items-center justify-center min-h-[320px] relative rounded-[2.5rem] overflow-hidden border-white/5 shadow-2xl p-8 self-start">
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                  <div className="w-full flex-1 relative z-10">
                    <CircuitTrack3D circuitId={circuitId} />
                  </div>
                  <div className="relative z-10 mt-4 text-center space-y-1">
                    <div className="text-lg font-black uppercase italic tracking-tight text-white/80">{circuit?.circuitName}</div>
                    <div className="text-[9px] font-black uppercase tracking-[0.8em] text-mkbhd-red animate-pulse">{selectedYear} Season</div>
                  </div>
                  <div className="absolute inset-0 bg-linear-to-br from-mkbhd-red/5 via-transparent to-transparent pointer-events-none" />
                </div>
                <div className="lg:col-span-2 space-y-8">
                  <div className="flex gap-2 flex-wrap">
                    {visibleSessionTabs.map(tab => {
                      const cached = tab.key === sessionTab
                        ? currentSession
                        : queryClient.getQueryData<RaceWeekendEntry>(raceWeekendQueryKey(circuitId, selectedYear, tab.key));
                      const hasData = cached?.available;
                      const checked = cached !== undefined;
                      if (checked && !hasData && tab.key !== 'race' && tab.key !== 'quali') return null;
                      return (
                        <button key={tab.key} onClick={() => setSessionTab(tab.key)}
                          className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${sessionTab === tab.key ? 'bg-mkbhd-red text-white border-mkbhd-red' : 'bg-white/5 border-white/10 text-mkbhd-gray hover:text-white hover:border-white/30'}`}>
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mkbhd-card p-10 bg-mkbhd-red/5 border-mkbhd-red/20 min-h-[300px]">
                    <div className="text-xs font-black uppercase tracking-[0.4em] text-mkbhd-red mb-8">
                      {SESSION_TABS.find(t => t.key === sessionTab)?.label} — {selectedYear}
                    </div>
                    {sessionLoading && !currentSession ? (
                      <div className="text-mkbhd-red animate-pulse font-black italic text-sm">LOADING...</div>
                    ) : currentSession?.available ? (
                      <div className="space-y-3">
                        {currentSession.results.map((r, i) => {
                          const isFP = ['fp1','fp2','fp3'].includes(sessionTab);
                          const isQuali = sessionTab === 'quali';
                          return (
                            <div key={i}
                              onClick={() => !isFP && onDriverClick?.(r.driver_id as string)}
                              className={`flex items-center justify-between border-b border-white/5 pb-3 last:border-0 rounded-lg px-2 -mx-2 transition-colors group ${!isFP ? 'cursor-pointer hover:bg-white/5' : ''}`}>
                              <div className="flex items-center gap-4">
                                <span className="text-xl font-black italic text-white/20 group-hover:text-mkbhd-red transition-colors">
                                  {!isFP && !isQuali && !r.is_finished ? 'DNF' : `P${r.position}`}
                                </span>
                                <div>
                                  <div className="font-black uppercase italic text-sm group-hover:text-mkbhd-red transition-colors">{r.family_name}</div>
                                  {r.team && <div className="text-[9px] text-mkbhd-gray uppercase tracking-widest mt-0.5">{r.team}</div>}
                                </div>
                              </div>
                              <div className="text-[10px] font-bold text-mkbhd-gray font-mono">{r.time}</div>
                            </div>
                          );
                        })}
                      </div>
                    ) : currentSession && !currentSession.available ? (
                      <div className="text-mkbhd-gray italic text-sm">No data for this session</div>
                    ) : (
                      <div className="text-mkbhd-gray italic text-sm">Select a session tab above</div>
                    )}
                  </div>
                </div>
              </div>
            )}
         </div>
       ) : null}
    </StudioModal>
  );
};
