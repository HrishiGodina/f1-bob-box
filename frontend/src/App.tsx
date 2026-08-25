import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Trophy, Newspaper, Zap, MapPin, X,
  Activity, Flag,
  User, Menu, ChevronRight, Play, Eye, Users
} from 'lucide-react';
import {
  AreaChart, Area, YAxis, ResponsiveContainer
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/900.css";
import { CIRCUIT_GEOJSON } from './circuits/index';
import { LiveDashboard } from './live/LiveDashboard';

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:8000/api";

// --- Custom Components ---

const StudioButton = ({ children, onClick, variant = 'primary', className = '' }: any) => (
  <button 
    onClick={onClick}
    className={`${variant === 'primary' ? 'mkbhd-btn-primary' : 'mkbhd-btn-secondary'} ${className} transform transition-transform hover:scale-[1.02] active:scale-[0.98]`}
  >
    {children}
  </button>
);

const TEAM_COLORS: Record<string, { color: string; short: string }> = {
  mercedes:     { color: '#00D2BE', short: 'MER' },
  red_bull:     { color: '#3671C6', short: 'RBR' },
  ferrari:      { color: '#E8002D', short: 'FER' },
  mclaren:      { color: '#FF8000', short: 'MCL' },
  aston_martin: { color: '#229971', short: 'AMF' },
  alpine:       { color: '#0093CC', short: 'ALP' },
  williams:     { color: '#64C4FF', short: 'WIL' },
  haas:         { color: '#B6BABD', short: 'HAA' },
  rb:           { color: '#6692FF', short: 'RB' },
  sauber:       { color: '#52E252', short: 'SAU' },
  kick_sauber:  { color: '#52E252', short: 'SAU' },
};

const TeamLogo = ({ teamId, className }: { teamId: string; className?: string }) => {
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

const StudioModal = ({ isOpen, onClose, title, children }: any) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);
  return (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-mkbhd-black/98 backdrop-blur-xl" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full h-full md:h-auto md:max-w-7xl md:max-h-[92vh] bg-mkbhd-studio md:rounded-mkbhd md:border md:border-white/10 overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center justify-between p-8 border-b border-white/5">
            <h2 className="text-3xl font-black flex items-center gap-4 text-white uppercase italic tracking-tighter">
              <span className="w-1.5 h-8 bg-mkbhd-red shadow-[0_0_15px_rgba(204,0,0,0.4)]" />
              {title}
            </h2>
            <button onClick={onClose} className="p-3 bg-white/5 hover:bg-mkbhd-red rounded-full transition-all group">
              <X size={24} className="group-hover:rotate-90 transition-transform" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
  );
};

// --- Real circuit geometry from GeoJSON ---

const CIRCUIT_ID_MAP: Record<string, string> = {
  bahrain: 'bahrain', jeddah: 'jeddah', albert_park: 'albert_park',
  suzuka: 'suzuka', shanghai: 'shanghai', miami: 'miami', imola: 'imola',
  monaco: 'monaco', villeneuve: 'villeneuve', catalunya: 'catalunya',
  red_bull_ring: 'red_bull_ring', silverstone: 'silverstone',
  hungaroring: 'hungaroring', spa: 'spa', zandvoort: 'zandvoort',
  monza: 'monza', baku: 'baku', marina_bay: 'marina_bay',
  americas: 'americas', rodriguez: 'rodriguez', interlagos: 'interlagos',
  las_vegas: 'las_vegas', vegas: 'las_vegas', losail: 'losail', yas_marina: 'yas_marina',
  madring: 'madring',
};

const geoJsonToSvgPath = (geojson: any, w = 440, h = 310, pad = 24): string => {
  try {
    const feat = geojson?.features?.[0];
    if (!feat) return '';
    const coords: [number, number][] = feat.geometry.type === 'LineString'
      ? feat.geometry.coordinates
      : feat.geometry.coordinates[0];
    if (!coords?.length) return '';

    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const spanLon = maxLon - minLon || 1;
    const spanLat = maxLat - minLat || 1;
    const scale = Math.min((w - pad * 2) / spanLon, (h - pad * 2) / spanLat);
    const offX = pad + ((w - pad * 2) - spanLon * scale) / 2;
    const offY = pad + ((h - pad * 2) - spanLat * scale) / 2;

    const pts = coords.map(([lon, lat]) => [
      offX + (lon - minLon) * scale,
      offY + (maxLat - lat) * scale,
    ] as [number, number]);

    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
  } catch {
    return '';
  }
};

// Fallback procedural path (used only when no GeoJSON available)
const hashString = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const fallbackTrackPath = (circuitId: string) => {
  const rand = mulberry32(hashString(circuitId || 'default'));
  const cx = 220, cy = 155;
  const n = 10;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const r = 80 + rand() * 90;
    pts.push([cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 0.82]);
  }
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ' Z';
  return d;
};

const CircuitTrack3D = ({ circuitId }: { circuitId: string }) => {
  const uid = useMemo(() => (circuitId || 'default').replace(/[^a-z0-9]/gi, '_'), [circuitId]);

  const path = useMemo(() => {
    const key = CIRCUIT_ID_MAP[circuitId];
    const geojson = key ? CIRCUIT_GEOJSON[key] : null;
    if (geojson) return geoJsonToSvgPath(geojson);
    return fallbackTrackPath(circuitId || 'default');
  }, [circuitId]);

  if (!path) return null;

  return (
    <div className="relative w-full h-full" style={{ minHeight: '180px' }}>
      <svg viewBox="0 0 440 310" className="w-full h-full" style={{ transform: 'perspective(620px) rotateX(26deg)', transformOrigin: 'center 62%' }}>
        <defs>
          <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`dot-${uid}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Drop shadow for 3D depth */}
        <path d={path} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" transform="translate(5,14)" opacity={0.55} />
        {/* Outer track glow */}
        <path d={path} fill="none" stroke="rgba(204,0,0,0.18)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" filter={`url(#glow-${uid})`} />
        {/* Track surface */}
        <path d={path} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        {/* Red racing line */}
        <path d={path} fill="none" stroke="#cc0000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="12 8" opacity={0.7} />
        {/* Start/finish flash */}
        <path d={path} fill="none" stroke="#cc0000" strokeWidth="9" strokeLinecap="butt" strokeDasharray="4 9999" opacity={0.95} />
        {/* Trailing glow */}
        <circle r="14" fill="none" stroke="#cc0000" strokeWidth="1.5" opacity={0.3} filter={`url(#dot-${uid})`}>
          <animateMotion dur="9s" repeatCount="indefinite" path={path} rotate="auto" />
        </circle>
        {/* Car dot */}
        <circle r="5" fill="#cc0000" filter={`url(#dot-${uid})`}>
          <animateMotion dur="9s" repeatCount="indefinite" path={path} rotate="auto" />
        </circle>
      </svg>
    </div>
  );
};

const CircuitElevation = ({ circuitId }: { circuitId: string }) => {
  const data = useMemo(() => {
    const count = 40;
    const base = circuitId?.includes('monaco') ? 20 : circuitId?.includes('spa') ? 60 : 10;
    return Array.from({ length: count + 1 }, (_, i) => ({
      x: i,
      y: base + Math.sin(i / 3) * (base / 2) + (i % 7) * 0.8
    }));
  }, [circuitId]);

  return (
    <div className="h-28 w-full bg-white/[0.02] rounded-2xl border border-white/5 relative overflow-hidden">
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

const SESSION_TABS = [
  { key: 'race',   label: 'RACE' },
  { key: 'quali',  label: 'QUALI' },
  { key: 'sprint', label: 'SPRINT' },
  { key: 'fp1',    label: 'FP1', fpOnly: true },
  { key: 'fp2',    label: 'FP2', fpOnly: true },
  { key: 'fp3',    label: 'FP3', fpOnly: true },
];

const CircuitDetailsModal = ({ isOpen, onClose, circuit, onDriverClick }: any) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [yearResults, setYearResults] = useState<any[]>([]);
  const [yearLoading, setYearLoading] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [mainTab, setMainTab] = useState<'circuit' | 'weekend'>('circuit');
  const [sessionTab, setSessionTab] = useState('race');
  // cache: { [year_session]: { results, available } }
  const [sessionCache, setSessionCache] = useState<Record<string, any>>({});
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);
    setSelectedYear(null);
    setYearResults([]);
    setResultsExpanded(false);
    setMainTab('circuit');
    setSessionTab('race');
    setSessionCache({});
    if (!isOpen || !circuit?.circuitId) return;
    setLoading(true);
    axios.get(`${API_BASE}/circuit/${circuit.circuitId}`)
      .then(res => {
        setData(res.data);
        const years: number[] = res.data.available_years || [];
        if (years.length > 0) setSelectedYear(years[years.length - 1]);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [isOpen, circuit?.circuitId]);

  useEffect(() => {
    if (!isOpen || !circuit?.circuitId || selectedYear === null) return;
    setYearLoading(true);
    setYearResults([]);
    setResultsExpanded(false);
    axios.get(`${API_BASE}/circuit/${circuit.circuitId}?season=${selectedYear + 1}`)
      .then(res => setYearResults(res.data.prev_results || []))
      .catch(() => setYearResults([]))
      .finally(() => setYearLoading(false));
  }, [selectedYear, circuit?.circuitId, isOpen]);

  // Fetch race-weekend session data when tab or year changes
  useEffect(() => {
    if (!isOpen || !circuit?.circuitId || selectedYear === null || mainTab !== 'weekend') return;
    const cacheKey = `${selectedYear}_${sessionTab}`;
    if (sessionCache[cacheKey] !== undefined) return;
    const tab = SESSION_TABS.find(t => t.key === sessionTab);
    if (tab?.fpOnly && selectedYear < 2023) {
      setSessionCache(c => ({ ...c, [cacheKey]: { results: [], available: false } }));
      return;
    }
    setSessionLoading(true);
    axios.get(`${API_BASE}/race-weekend/${circuit.circuitId}`, { params: { year: selectedYear, session: sessionTab } })
      .then(res => setSessionCache(c => ({ ...c, [cacheKey]: res.data })))
      .catch(() => setSessionCache(c => ({ ...c, [cacheKey]: { results: [], available: false } })))
      .finally(() => setSessionLoading(false));
  }, [isOpen, circuit?.circuitId, selectedYear, sessionTab, mainTab]);

  const circuitId = circuit?.circuitId || '';
  const currentCacheKey = `${selectedYear}_${sessionTab}`;
  const currentSession = sessionCache[currentCacheKey];
  const visibleSessionTabs = SESSION_TABS.filter(t => !t.fpOnly || (selectedYear !== null && selectedYear >= 2023));

  const YearPicker = () => data?.available_years?.length > 0 ? (
    <select
      value={selectedYear ?? ''}
      onChange={e => { setSelectedYear(Number(e.target.value)); setSessionCache({}); }}
      className="bg-white/10 text-white text-[10px] font-black uppercase tracking-widest border border-white/10 rounded-lg px-3 py-1.5 cursor-pointer focus:outline-none focus:border-mkbhd-red"
    >
      {[...data.available_years].reverse().map((y: number) => (
        <option key={y} value={y} className="bg-mkbhd-studio text-white">{y}</option>
      ))}
    </select>
  ) : null;

  return (
    <StudioModal isOpen={isOpen} onClose={onClose} title={`${circuit?.circuitName?.toUpperCase() || 'CIRCUIT'} ANALYSIS`}>
       {loading ? (
         <div className="h-96 flex items-center justify-center text-mkbhd-red animate-pulse font-black italic text-4xl">SATELLITE_SCANNING...</div>
       ) : error ? (
         <div className="h-96 flex items-center justify-center text-mkbhd-gray font-black italic text-2xl">DATA_LINK_FAILED — try again</div>
       ) : data ? (
         <div className="space-y-10">
            {/* Main tab bar */}
            <div className="flex items-center gap-4">
              <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10">
                {(['circuit', 'weekend'] as const).map(tab => (
                  <button key={tab} onClick={() => setMainTab(tab)}
                    className={`px-8 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${mainTab === tab ? 'bg-mkbhd-red text-white shadow-lg' : 'text-mkbhd-gray hover:text-white'}`}>
                    {tab === 'circuit' ? 'CIRCUIT' : 'RACE WEEKEND'}
                  </button>
                ))}
              </div>
              <div className="ml-auto"><YearPicker /></div>
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
                      <div key={s.label} className="mkbhd-card p-8 bg-white/[0.02]">
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
                      {data.upgrades.map((u: any) => (
                        <div key={u.team} className="p-6 bg-white/5 rounded-2xl border border-white/10">
                          <div className="text-[10px] font-black text-white uppercase mb-2">{u.team}</div>
                          <div className="text-sm font-bold text-mkbhd-gray">{u.item}</div>
                          <div className={`text-[8px] font-black uppercase mt-4 px-2 py-0.5 rounded inline-block ${u.impact === 'High' ? 'bg-mkbhd-red text-white' : 'bg-white/10 text-white'}`}>Impact: {u.impact}</div>
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
                    <div className="absolute inset-0 bg-gradient-to-br from-mkbhd-red/5 via-transparent to-transparent pointer-events-none" />
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
                          {(resultsExpanded ? yearResults : yearResults.slice(0, 5)).map((r: any) => {
                            const isFinished = !r.status || r.status.toLowerCase().startsWith('finished') || /^\+\d+ Lap/.test(r.status);
                            return (
                              <div key={r.Driver?.driverId || r.position} onClick={() => onDriverClick?.(r.Driver?.driverId)} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 cursor-pointer hover:bg-white/5 rounded-lg px-2 -mx-2 transition-colors group">
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
                  <div className="p-8 mkbhd-card bg-white/[0.01] italic text-sm leading-relaxed text-mkbhd-gray border-dashed border-white/10">
                    <span className="text-white font-black not-italic block mb-4 uppercase tracking-widest text-[10px]">Strategic Intel:</span>
                    "The high-downforce nature of this circuit demands maximum efficiency from the front wing. Thermal degradation on the rear-left is the primary performance bottleneck."
                  </div>
                </div>
              </div>
            )}

            {mainTab === 'weekend' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Left: track card */}
                <div className="mkbhd-card bg-mkbhd-black flex flex-col items-center justify-center min-h-[320px] relative rounded-[2.5rem] overflow-hidden border-white/5 shadow-2xl p-8 self-start">
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                  <div className="w-full flex-1 relative z-10">
                    <CircuitTrack3D circuitId={circuitId} />
                  </div>
                  <div className="relative z-10 mt-4 text-center space-y-1">
                    <div className="text-lg font-black uppercase italic tracking-tight text-white/80">{circuit?.circuitName}</div>
                    <div className="text-[9px] font-black uppercase tracking-[0.8em] text-mkbhd-red animate-pulse">{selectedYear} Season</div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-br from-mkbhd-red/5 via-transparent to-transparent pointer-events-none" />
                </div>
                {/* Right: session tabs + results */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Session sub-tab bar */}
                  <div className="flex gap-2 flex-wrap">
                    {visibleSessionTabs.map(tab => {
                      const cKey = `${selectedYear}_${tab.key}`;
                      const cached = sessionCache[cKey];
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
                  {/* Results */}
                  <div className="mkbhd-card p-10 bg-mkbhd-red/5 border-mkbhd-red/20 min-h-[300px]">
                    <div className="text-xs font-black uppercase tracking-[0.4em] text-mkbhd-red mb-8">
                      {SESSION_TABS.find(t => t.key === sessionTab)?.label} — {selectedYear}
                    </div>
                    {sessionLoading && !currentSession ? (
                      <div className="text-mkbhd-red animate-pulse font-black italic text-sm">LOADING...</div>
                    ) : currentSession?.available ? (
                      <div className="space-y-3">
                        {currentSession.results.map((r: any, i: number) => {
                          const isFP = ['fp1','fp2','fp3'].includes(sessionTab);
                          const isQuali = sessionTab === 'quali';
                          return (
                            <div key={i}
                              onClick={() => !isFP && onDriverClick?.(r.driver_id)}
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

const SectionHeader = ({ icon: Icon, title, id }: { icon: any, title: string, id?: string }) => (
  <div className="flex items-center justify-between mb-12" id={id}>
    <div className="flex items-center gap-4">
      <div className="p-3 bg-white/5 rounded-2xl text-mkbhd-red">
        <Icon size={24} />
      </div>
      <h2 className="text-3xl font-black uppercase tracking-widest italic text-white">
        {title}
      </h2>
    </div>
    <div className="h-px flex-1 bg-white/10 ml-8 hidden md:block" />
  </div>
);

const CareerModal = ({ isOpen, onClose, type, id }: any) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && id) {
      const fetchStats = async () => {
        setLoading(true);
        try {
          const res = await axios.get(`${API_BASE}/${type}/${id}/stats`);
          setData(res.data);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchStats();
    }
  }, [isOpen, type, id]);

  return (
    <StudioModal isOpen={isOpen} onClose={onClose} title={`${type?.toUpperCase()} PROFILE`}>
      {loading ? (
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
            <div className="mkbhd-card p-12 flex flex-col items-center justify-center bg-white/[0.02]">
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
                {data.career_teams.map((t: any) => (
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
};

// Official F1 wordmark SVG — angular "F1" letterforms in brand red/white
const F1Logo = ({ className = '', color = '#cc0000' }: { className?: string; color?: string }) => (
  <svg className={className} viewBox="0 0 120 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* F letterform */}
    <polygon points="0,0 52,0 52,10 12,10 12,18 46,18 46,28 12,28 12,44 0,44" fill={color} />
    {/* 1 letterform */}
    <polygon points="62,0 80,0 80,44 68,44 68,10 58,14 58,2" fill="white" />
    {/* Red accent bar */}
    <rect x="84" y="0" width="36" height="8" fill={color} />
    <rect x="84" y="18" width="36" height="8" fill={color} />
    <rect x="84" y="36" width="36" height="8" fill={color} />
  </svg>
);

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};

// --- Main App Component ---

export default function App() {
  const [status, setStatus] = useState<any>({ is_live: false });
  const [idleData, setIdleData] = useState<any>({
    driver_standings: [],
    constructor_standings: [],
    news: [],
    schedule: [],
    next_race: { raceName: "Loading Grand Prix", Circuit: { circuitName: "Scanning..." }, date: "TBD" }
  });
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [standingsType, setStandingsType] = useState<'drivers' | 'teams'>('drivers');
  const [careerProfile, setCareerProfile] = useState<{ type: string, id: string } | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/status`);
      if (res.data) setStatus(res.data);
      
      // Always fetch idle data if it's empty or hasn't been fetched
      if (idleData.driver_standings.length === 0) {
        try {
          const [idleRes] = await Promise.all([ 
            axios.get(`${API_BASE}/idle-data`)
          ]);
          if (idleRes.data) setIdleData(idleRes.data);
        } catch (innerError) {
          console.error("Error fetching dashboard data:", innerError);
        }
      }
    } catch (e) { 
      console.error("Error fetching status:", e); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Splash: 'logo' (pulse 1.8s) → 'expand' (scale to fill, 0.6s) → 'done'
  const [splashPhase, setSplashPhase] = useState<'logo' | 'expand' | 'done'>(loading ? 'logo' : 'done');
  useEffect(() => {
    if (!loading && splashPhase === 'logo') {
      setSplashPhase('expand');
      const t = setTimeout(() => setSplashPhase('done'), 700);
      return () => clearTimeout(t);
    }
  }, [loading]);

  if (splashPhase !== 'done') return (
    <AnimatePresence>
      <motion.div
        key="splash"
        className="fixed inset-0 z-[9999] bg-mkbhd-black flex flex-col items-center justify-center overflow-hidden"
        animate={splashPhase === 'expand' ? { scale: 20, opacity: 0 } : {}}
        transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
      >
        <motion.div
          animate={splashPhase === 'logo' ? { opacity: [1, 0.5, 1] } : { scale: 1 }}
          transition={splashPhase === 'logo' ? { repeat: Infinity, duration: 1.4 } : {}}
          className="flex flex-col items-center gap-6"
        >
          <F1Logo className="w-32 h-auto" color="#cc0000" />
          <div className="text-[9px] font-black uppercase tracking-[0.8em] text-mkbhd-gray">Strategy Center // 2026</div>
        </motion.div>
        {splashPhase === 'logo' && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-1.5 h-1.5 rounded-full bg-mkbhd-red" />
            <span className="text-[8px] font-black uppercase tracking-[0.6em] text-mkbhd-gray">Initializing</span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-mkbhd-black text-white selection:bg-mkbhd-red selection:text-white">
      {/* --- Navbar --- */}
      <nav className="studio-header px-8 md:px-16 py-8 flex justify-between items-center">
        <div className="flex items-center gap-8 group cursor-pointer" onClick={() => window.location.reload()}>
           <F1Logo className="w-16 h-auto" color="#cc0000" />
           <div className="hidden md:block h-8 w-px bg-white/10" />
           <div className="hidden md:flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.5em] text-mkbhd-gray leading-none">Strategy Center</span>
              <span className="text-[8px] font-bold text-mkbhd-red uppercase tracking-[0.2em] mt-1">Ref 2026 // Studio Standard</span>
           </div>
        </div>

        <div className="flex items-center gap-10">
          <div className="hidden lg:flex gap-12 text-[11px] font-black uppercase tracking-[0.3em] text-mkbhd-gray font-bold">
             {[
               { name: 'Broadcast', id: 'news' },
               { name: 'Telemetry', id: 'standings' },
               { name: 'Analytics', id: 'archive' },
               { name: 'Standings', id: 'standings' }
             ].map(item => (
               <span 
                key={item.name} 
                onClick={() => scrollToSection(item.id)}
                className="hover:text-white transition-all cursor-pointer hover:tracking-[0.4em]"
               >
                {item.name}
               </span>
             ))}
          </div>
          
          <div className="flex items-center gap-6 pl-10 border-l border-white/10">
            <motion.div 
              animate={status?.is_live ? { opacity: [1, 0.6, 1] } : {}}
              className={`flex items-center gap-3 px-6 py-2.5 rounded-full border text-[10px] font-black tracking-widest transition-all ${status?.is_live ? 'bg-mkbhd-red border-mkbhd-red shadow-xl shadow-mkbhd-red/20' : 'bg-white/5 border-white/10 text-mkbhd-gray'}`}
            >
              <div className={`w-2 h-2 rounded-full ${status?.is_live ? 'bg-white shadow-[0_0_10px_white]' : 'bg-mkbhd-gray'}`} />
              {status?.is_live ? 'LIVE SESSION' : 'OFFLINE'}
            </motion.div>
            <button className="lg:hidden p-3 bg-white/5 rounded-xl text-white" onClick={() => setMobileMenuOpen(true)}><Menu size={24} /></button>
          </div>
        </div>
      </nav>

      {/* --- Mobile Menu --- */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="fixed inset-0 z-[300] bg-mkbhd-black p-12 flex flex-col justify-center gap-12">
             <button className="absolute top-12 right-12 p-4 bg-white/5 rounded-full text-white" onClick={() => setMobileMenuOpen(false)}><X size={40} /></button>
             {['Broadcast', 'Telemetry', 'Standings', 'Milestones'].map((item) => (
               <div key={item} className="text-6xl font-black italic tracking-tighter hover:text-mkbhd-red transition-all cursor-pointer uppercase" onClick={() => setMobileMenuOpen(false)}>{item}</div>
             ))}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="p-8 md:p-16 max-w-[1920px] mx-auto overflow-hidden">
        <AnimatePresence mode="wait">
          {status?.is_live ? (
            <motion.div key="live" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
               <LiveDashboard />
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-24">
              
              {/* --- Hero Section --- */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-20 items-center min-h-[60vh]">
                <div className="lg:col-span-8 space-y-12">
                   <div className="flex items-center gap-6 text-mkbhd-red mb-8 animate-mkbhd-reveal">
                      <div className="h-1.5 w-24 bg-mkbhd-red rounded-full shadow-[0_0_15px_rgba(204,0,0,0.5)]" />
                      <span className="text-sm font-black uppercase tracking-[0.6em] italic">Next Transmission Active</span>
                   </div>
                   <h1 className="text-[8vw] lg:text-[7rem] leading-[1.05] tracking-tight mb-16 animate-mkbhd-reveal">
                      {idleData?.next_race?.raceName ? idleData.next_race.raceName.split(' ')[0] : 'UPCOMING'}<br/>
                      <span className="text-mkbhd-red italic">{idleData?.next_race?.raceName?.split(' ').slice(1).join(' ') || 'BATTLE'}</span>
                   </h1>
                   <div className="flex flex-wrap gap-20 border-t border-white/10 pt-16 animate-mkbhd-reveal" style={{ animationDelay: '0.2s' }}>
                      <div className="group cursor-pointer" onClick={() => setActiveModal('next_race')}>
                        <div className="text-[10px] font-black text-mkbhd-gray uppercase tracking-[0.5em] mb-4 group-hover:text-white transition-colors">Tactical Location</div>
                        <div className="text-4xl font-black italic text-white uppercase group-hover:text-mkbhd-red transition-all">{idleData?.next_race?.Circuit?.circuitName}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-mkbhd-gray uppercase tracking-[0.5em] mb-4">Race Date</div>
                        <div className="text-4xl font-black italic text-white uppercase">{idleData?.next_race?.date}</div>
                      </div>
                      <StudioButton className="w-full md:w-auto px-20 py-8 text-2xl shadow-2xl shadow-mkbhd-red/40 hover:scale-105" onClick={() => setActiveModal('next_race')}>
                        System Briefing
                      </StudioButton>
                   </div>
                </div>
                <div className="lg:col-span-4 relative hidden lg:block">
                   <motion.div
                     className="mkbhd-card overflow-hidden group border-white/10 rounded-[3rem] bg-mkbhd-studio relative cursor-pointer flex flex-col p-10 gap-4 aspect-square"
                     onClick={() => setActiveModal('next_race')}
                     whileHover={{ scale: 1.01 }}
                     transition={{ duration: 0.3 }}
                   >
                      {/* Header */}
                      <div className="flex items-start justify-between z-10">
                         <div className="flex items-center gap-3">
                            <MapPin size={16} className="text-mkbhd-red" />
                            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Circuit Layout</div>
                         </div>
                         <div className="text-[9px] font-black uppercase tracking-[0.5em] text-mkbhd-red">Round {idleData?.next_race?.round || '—'}</div>
                      </div>

                      {/* 3D Track visualization — the centerpiece */}
                      <div className="flex-1 relative flex items-center justify-center -my-2">
                         <CircuitTrack3D circuitId={idleData?.next_race?.Circuit?.circuitId || 'default'} />
                      </div>

                      {/* Footer telemetry strip */}
                      <div className="flex items-center justify-between z-10 pt-2 border-t border-white/5">
                         <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-mkbhd-gray">
                            <span className="w-1.5 h-1.5 rounded-full bg-mkbhd-red animate-pulse" /> Live Sim
                         </div>
                         <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">{idleData?.next_race?.date || 'TBD'}</div>
                      </div>
                   </motion.div>
                </div>
              </section>

              {/* --- Standings --- */}
              <section id="standings">
                <div className="mkbhd-card p-12 bg-white/[0.01] flex flex-col border-white/10 rounded-[2.5rem]">
                   <div className="flex flex-col md:flex-row md:items-center gap-6 mb-12">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/5 rounded-2xl text-mkbhd-red"><Trophy size={24} /></div>
                        <h2 className="text-lg font-black uppercase tracking-widest italic text-white">World Championship</h2>
                      </div>
                      <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 self-start">
                        {['drivers', 'teams'].map(type => (
                          <button key={type} onClick={() => setStandingsType(type as any)} className={`px-6 py-2.5 text-[10px] font-black uppercase transition-all rounded-xl ${standingsType === type ? 'bg-mkbhd-red text-white shadow-lg shadow-mkbhd-red/20' : 'text-mkbhd-gray hover:text-white'}`}>{type}</button>
                        ))}
                      </div>
                      <div className="md:ml-auto">
                        <StudioButton variant="secondary" className="px-8 py-4 text-xs tracking-[0.5em]" onClick={() => setActiveModal('standings')}>SEASON STANDINGS</StudioButton>
                      </div>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-12 gap-y-4">
                      {(standingsType === 'drivers' ? idleData?.driver_standings : idleData?.constructor_standings)?.slice(0, 12).map((s: any, i: number) => {
                        const entityId = standingsType === 'drivers' ? s.Driver.driverId : s.Constructor.constructorId;
                        const teamId = standingsType === 'drivers' ? s.Constructors?.[0]?.constructorId : entityId;
                        return (
                          <motion.div key={i} whileHover={{ x: 6 }} onClick={() => setCareerProfile({ type: standingsType === 'drivers' ? 'driver' : 'constructor', id: entityId })} className="flex items-center gap-4 group cursor-pointer border-b border-white/[0.03] py-5 last:border-0">
                             <span className="text-2xl font-black italic text-white/5 group-hover:text-mkbhd-red transition-all w-8 flex-shrink-0">{(i+1).toString().padStart(2, '0')}</span>
                             <TeamLogo teamId={teamId} className="w-10 h-10 flex-shrink-0" />
                             <div className="flex-1 min-w-0">
                                <div className="text-lg font-black uppercase text-white group-hover:text-mkbhd-red transition-all italic tracking-tight truncate">{standingsType === 'drivers' ? s.Driver.familyName : s.Constructor.name}</div>
                                <div className="text-[9px] font-bold text-mkbhd-gray uppercase tracking-[0.35em] italic opacity-50 truncate">{standingsType === 'drivers' ? s.Driver.nationality : s.Constructor.nationality}</div>
                             </div>
                             <div className="text-right flex-shrink-0 flex items-baseline gap-1.5">
                                <span className="text-xl font-black text-white italic leading-none">{s.points}</span>
                                <span className="text-[9px] font-black text-mkbhd-red uppercase tracking-wider">PTS</span>
                             </div>
                          </motion.div>
                        );
                      })}
                   </div>
                </div>
              </section>

              {/* --- This Season (completed rounds) --- */}
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const completed = idleData?.schedule?.filter((r: any) => r.date < today) || [];
                const upcoming = idleData?.schedule?.filter((r: any) => r.date >= today) || [];
                return (
                  <>
                    {completed.length > 0 && (
                      <section className="space-y-12">
                        <SectionHeader icon={Flag} title="This Season" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                          {completed.map((race: any, i: number) => (
                            <motion.div
                              key={i} whileHover={{ scale: 1.02 }}
                              onClick={() => { setSelectedCircuit(race.Circuit); }}
                              className="mkbhd-card p-10 bg-white/[0.01] border-white/10 group hover:border-mkbhd-red transition-all rounded-[2.5rem] relative overflow-hidden cursor-pointer"
                            >
                              <div className="absolute -right-6 -top-6 text-white/5 font-black text-8xl italic group-hover:text-mkbhd-red/10 transition-colors">#{race.round}</div>
                              <h4 className="text-2xl font-black leading-tight mb-4 uppercase italic tracking-tighter">{race.raceName}</h4>
                              <div className="text-[11px] font-black text-mkbhd-gray uppercase tracking-[0.4em] mb-8 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-mkbhd-red" /> {race.Circuit?.Location?.country}
                              </div>
                              <div className="text-xs font-black text-white flex items-center justify-between pt-6 border-t border-white/10">
                                <span className="italic tracking-widest">{race.date}</span>
                                <div className="p-2 bg-mkbhd-red/10 rounded-xl text-mkbhd-red text-[9px] font-black uppercase tracking-widest">RESULTS</div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* --- Upcoming Races --- */}
                    {upcoming.length > 0 && (
                      <section className="space-y-12" id="archive">
                        <SectionHeader icon={MapPin} title="Upcoming Races" />
                        <div className="flex gap-8 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
                          {upcoming.map((race: any, i: number) => (
                            <motion.div key={i} whileHover={{ scale: 1.02 }} onClick={() => setSelectedCircuit(race.Circuit)} className="mkbhd-card p-14 bg-white/[0.01] border-white/10 group hover:border-mkbhd-red transition-all rounded-[3rem] relative overflow-hidden flex-shrink-0 w-72 cursor-pointer">
                              <div className="absolute -right-8 -top-8 text-white/5 font-black text-9xl italic group-hover:text-mkbhd-red/10 transition-colors">#{race.round}</div>
                              <h4 className="text-4xl font-black leading-tight mb-6 uppercase italic tracking-tighter">{race.raceName}</h4>
                              <div className="text-[12px] font-black text-mkbhd-gray uppercase tracking-[0.4em] mb-16 flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-mkbhd-red" /> {race.Circuit?.Location?.country}
                              </div>
                              <div className="text-xs font-black text-white flex items-center justify-between pt-10 border-t border-white/10">
                                <span className="italic tracking-widest">{race.date}</span>
                                <div className="p-3 bg-white/5 rounded-full group-hover:bg-mkbhd-red transition-colors">
                                  <MapPin size={24} className="group-hover:text-white transition-colors" />
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* --- News (Global Dispatch) --- */}
                    <section className="space-y-12" id="news">
                      <SectionHeader icon={Newspaper} title="Global Dispatch" />
                      <div className="flex gap-8 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
                        {idleData?.news?.map((n: any, i: number) => (
                          <motion.a whileHover={{ y: -8, scale: 0.99 }} key={i} href={n.links?.web?.href} target="_blank" className="mkbhd-card group flex flex-col bg-white/[0.01] overflow-hidden border-white/10 rounded-[2rem] shadow-2xl flex-shrink-0 w-72">
                            <div className="h-44 relative overflow-hidden bg-mkbhd-black">
                              <img src={n.images?.[0]?.url} className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105" alt={n.headline} onError={(e: any) => { e.target.style.display = 'none'; }} />
                              <div className="absolute inset-0 bg-gradient-to-t from-mkbhd-black via-transparent to-transparent opacity-80" />
                              <div className="absolute top-4 left-4 px-3 py-1.5 bg-mkbhd-red/80 backdrop-blur-md rounded-md text-[8px] font-black uppercase tracking-widest text-white italic">DISPATCH</div>
                            </div>
                            <div className="p-6 space-y-4 flex-1">
                              <h3 className="text-xl font-black leading-tight text-white group-hover:text-mkbhd-red transition-colors uppercase italic">{n.headline}</h3>
                              <p className="text-xs text-mkbhd-gray font-bold line-clamp-2 leading-relaxed uppercase tracking-tight opacity-60 group-hover:opacity-100 transition-opacity">{n.description}</p>
                              <div className="pt-4 border-t border-white/5 flex items-center gap-3 text-mkbhd-red text-[9px] font-black uppercase tracking-[0.4em]">
                                <Eye size={13} /> READ <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                              </div>
                            </div>
                          </motion.a>
                        ))}
                      </div>
                    </section>

                    {/* --- Archive heading --- */}
                    <section className="space-y-8">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-12">
                        <h2 className="text-[12vw] tracking-tighter leading-none">THE <span className="text-mkbhd-red italic">ARCHIVE</span></h2>
                        <StudioButton variant="secondary" className="px-16 py-6 text-sm mt-6 md:mt-0" onClick={() => setActiveModal('schedule')}>Full Season Timeline</StudioButton>
                      </div>
                    </section>
                  </>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* --- Footer --- */}
      <footer className="p-16 border-t border-white/5 text-center bg-white/[0.01]">
         <div className="flex flex-col items-center gap-6">
            <div className="h-0.5 w-32 bg-mkbhd-red/40 rounded-full" />
            <div className="text-[9px] font-bold text-mkbhd-gray uppercase tracking-[0.6em] opacity-40 italic">F1D Strategy Center // 2026</div>
         </div>
      </footer>

      {/* --- Modals --- */}
      <StudioModal isOpen={activeModal === 'standings'} onClose={() => setActiveModal(null)} title="World Championship Archive">
         <div className="grid grid-cols-1 xl:grid-cols-2 gap-24">
            {[ { title: 'Drivers', data: idleData?.driver_standings, type: 'driver' }, { title: 'Constructors', data: idleData?.constructor_standings, type: 'constructor' } ].map((section) => (
              <div key={section.title} className="space-y-12">
                 <h3 className="text-4xl font-black italic flex items-center gap-8 text-white uppercase tracking-tighter"><Trophy size={40} className="text-mkbhd-red" /> {section.title}</h3>
                 <div className="mkbhd-card p-6 bg-white/[0.01] border-white/10 rounded-[3rem] shadow-2xl">
                    <table className="w-full">
                       <colgroup>
                         <col className="w-20" />
                         <col />
                         <col className="w-32" />
                       </colgroup>
                       <thead className="text-[12px] font-black text-mkbhd-gray uppercase border-b border-white/10">
                          <tr>
                            <th className="px-6 py-5 text-left">POS</th>
                            <th className="px-6 py-5 text-left">Driver</th>
                            <th className="px-6 py-5 text-right">Points</th>
                          </tr>
                       </thead>
                       <tbody className="text-lg">
                          {section.data?.map((s: any) => {
                             const entityId = section.type === 'driver' ? s.Driver.driverId : s.Constructor.constructorId;
                             const teamId = section.type === 'driver' ? s.Constructors[0].constructorId : entityId;
                             return (
                               <tr key={entityId} onClick={() => setCareerProfile({ type: section.type, id: entityId })} className="border-b border-white/[0.03] hover:bg-white/[0.05] cursor-pointer transition-all group">
                                  <td className="px-6 py-5 font-black italic text-3xl text-white/20 group-hover:text-mkbhd-red transition-colors align-middle">{s.position}</td>
                                  <td className="px-6 py-5 align-middle">
                                    <div className="flex items-center gap-5">
                                      <div className="w-12 h-12 shrink-0">
                                        <TeamLogo teamId={teamId} className="w-full h-full" />
                                      </div>
                                      <div>
                                        <div className="text-2xl font-black italic uppercase group-hover:text-mkbhd-red group-hover:translate-x-1 transition-all duration-200">{section.type === 'driver' ? s.Driver.familyName : s.Constructor.name}</div>
                                        <div className="text-[11px] font-black text-mkbhd-gray uppercase tracking-[0.4em] mt-1">{section.type === 'driver' ? s.Driver.nationality : s.Constructor.nationality}</div>
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

      <StudioModal isOpen={activeModal === 'schedule'} onClose={() => setActiveModal(null)} title="Season Matrix Timeline">
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {idleData?.schedule?.map((race: any) => (
              <div key={race.round} className="mkbhd-card p-16 bg-white/[0.01] hover:border-mkbhd-red transition-all group rounded-[4rem] relative overflow-hidden">
                 <div className="text-white/5 font-black italic text-[10rem] absolute -right-8 -top-8 group-hover:text-mkbhd-red/10 transition-colors">#{race.round.padStart(2, '0')}</div>
                 <div className="relative z-10">
                   <h4 className="text-4xl font-black leading-none mb-6 uppercase italic tracking-tightest">{race.raceName}</h4>
                   <div className="text-[13px] font-black text-mkbhd-gray uppercase tracking-[0.5em] mb-20 group-hover:text-white transition-colors">{race.Circuit.circuitName}</div>
                   <div className="flex justify-between items-end pt-12 border-t border-white/10">
                      <div className="space-y-3">
                        <div className="text-[10px] font-black text-mkbhd-red uppercase tracking-[0.3em]">Race Date</div>
                        <div className="text-xl font-black text-white italic tracking-widest">{race.date}</div>
                      </div>
                      <button onClick={() => { setSelectedCircuit(race.Circuit); setActiveModal(null); }} className="p-5 bg-white/5 rounded-3xl hover:bg-mkbhd-red transition-all hover:scale-110 z-20 relative text-white">
                        <Play size={32} fill="currentColor" />
                      </button>
                   </div>
                 </div>
              </div>
            ))}
         </div>
      </StudioModal>

      <StudioModal isOpen={activeModal === 'next_race'} onClose={() => setActiveModal(null)} title="Battle Strategy Briefing">
        {(() => {
          const nr = idleData?.next_race;
          const circuitId = nr?.Circuit?.circuitId || 'monaco';
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
              {/* Left: race info */}
              <div className="space-y-12">
                <div className="space-y-6">
                  <div className="text-mkbhd-red font-black uppercase tracking-[0.6em] text-sm flex items-center gap-4">
                    <div className="h-0.5 w-12 bg-mkbhd-red" /> Tactical Analysis
                  </div>
                  <h3 className="text-5xl md:text-6xl lg:text-7xl leading-[0.9] tracking-tighter uppercase italic break-words">{nr?.raceName}</h3>
                </div>
                <div className="p-10 mkbhd-card border-l-[10px] border-mkbhd-red bg-mkbhd-red/5 rounded-[2rem]">
                  <p className="text-xl md:text-2xl leading-[1.15] text-white italic font-black uppercase tracking-tight">
                    "Peak efficiency required. Aero-balance is the critical metric. Zero compromises in thermal management for this session."
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-8">
                  <div className="p-8 mkbhd-card bg-white/[0.01] border border-white/10 rounded-[2rem]">
                    <div className="text-[9px] font-black text-mkbhd-gray uppercase tracking-widest mb-3 italic">Location</div>
                    <div className="text-lg font-black italic text-white uppercase leading-tight">{nr?.Circuit?.Location?.locality}</div>
                    <div className="text-[9px] text-mkbhd-gray mt-1">{nr?.Circuit?.Location?.country}</div>
                  </div>
                  <div className="p-8 mkbhd-card bg-white/[0.01] border border-white/10 rounded-[2rem]">
                    <div className="text-[9px] font-black text-mkbhd-gray uppercase tracking-widest mb-3 italic">Round</div>
                    <div className="text-3xl font-black italic text-white">{nr?.round}</div>
                  </div>
                  <div className="p-8 mkbhd-card bg-white/[0.01] border border-white/10 rounded-[2rem]">
                    <div className="text-[9px] font-black text-mkbhd-gray uppercase tracking-widest mb-3 italic">Date</div>
                    <div className="text-lg font-black italic text-mkbhd-red uppercase leading-tight">{nr?.date}</div>
                  </div>
                </div>
                <CircuitElevation circuitId={circuitId} />
              </div>
              {/* Right: real circuit visualization */}
              <div className="mkbhd-card bg-mkbhd-black flex flex-col items-center justify-center min-h-[500px] relative rounded-[3rem] overflow-hidden border-white/5 shadow-2xl p-8">
                <div className="absolute inset-0 opacity-10"
                  style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                <div className="w-full flex-1 relative z-10">
                  <CircuitTrack3D circuitId={circuitId} />
                </div>
                <div className="relative z-10 mt-6 text-center space-y-2">
                  <div className="text-2xl font-black uppercase italic tracking-tight text-white/80">{nr?.Circuit?.circuitName}</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.8em] text-mkbhd-red animate-pulse">Circuit Layout Active</div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-mkbhd-red/5 via-transparent to-transparent pointer-events-none" />
              </div>
            </div>
          );
        })()}
      </StudioModal>

      <CircuitDetailsModal isOpen={!!selectedCircuit} onClose={() => setSelectedCircuit(null)} circuit={selectedCircuit} onDriverClick={(driverId: string) => setCareerProfile({ type: 'driver', id: driverId })} />
      {/* CareerModal last so it renders above all other modals */}
      <CareerModal isOpen={!!careerProfile} onClose={() => setCareerProfile(null)} type={careerProfile?.type} id={careerProfile?.id} />
    </div>
  );
}
