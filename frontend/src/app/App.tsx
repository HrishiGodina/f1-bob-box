import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/900.css';
import { F1Logo } from '../shared/ui/F1Logo';
import { useLiveStatus } from '../shared/api/useLiveStatus';
import { LiveDashboard } from '../features/live/LiveDashboard';
import { browserStorage, loadOverride, resolveLiveView, saveOverride } from '../features/live/liveView';
import type { LiveOverride } from '../features/live/liveView';
import { NextRaceHero } from '../features/next-race/NextRaceHero';
import { StandingsSection } from '../features/standings/StandingsSection';
import { SeasonSections } from '../features/calendar/SeasonSections';
import { ArchiveHeading } from '../features/calendar/ArchiveHeading';
import { NewsSection } from '../features/news/NewsSection';
import { StandingsModal } from '../features/standings/StandingsModal';
import { ScheduleModal } from '../features/calendar/ScheduleModal';
import { BriefingModal } from '../features/next-race/BriefingModal';
import { CircuitDetailsModal } from '../features/circuit-details/CircuitDetailsModal';
import { CareerModal } from '../features/career/CareerModal';
import type { CircuitSummary } from '../features/calendar/types';

type ActiveModal = 'standings' | 'schedule' | 'next_race' | null;

interface CareerProfile {
  type: 'driver' | 'constructor';
  id: string;
}

const NAV_ITEMS = [
  { name: 'Broadcast', id: 'news' },
  { name: 'Telemetry', id: 'telemetry' },
  { name: 'Analytics', id: 'archive' },
  { name: 'Standings', id: 'standings' },
];

const MOBILE_MENU_ITEMS = ['Broadcast', 'Telemetry', 'Standings', 'Milestones'];

const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};

export default function App() {
  const { data: status, isPending: statusLoading } = useLiveStatus();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [careerProfile, setCareerProfile] = useState<CareerProfile | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<CircuitSummary | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [liveOverride, setLiveOverride] = useState<LiveOverride>(() => loadOverride(browserStorage()));
  const [demoActive, setDemoActive] = useState(false);

  const effectiveLive = resolveLiveView(liveOverride, status?.is_live ?? false);

  const toggleLiveOverride = () => {
    const next: LiveOverride = effectiveLive ? 'off' : 'live';
    setLiveOverride(next);
    saveOverride(browserStorage(), next);
  };

  const resetLiveOverrideToAuto = () => {
    setLiveOverride(null);
    saveOverride(browserStorage(), null);
  };

  const toggleDemo = () => setDemoActive((prev) => !prev);

  const openCareerProfile = (type: 'driver' | 'constructor', id: string) => setCareerProfile({ type, id });

  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (statusLoading || splashDone) return;
    const t = setTimeout(() => setSplashDone(true), 700);
    return () => clearTimeout(t);
  }, [statusLoading, splashDone]);

  const splashPhase: 'logo' | 'expand' | 'done' = statusLoading ? 'logo' : splashDone ? 'done' : 'expand';

  if (splashPhase !== 'done') return (
    <AnimatePresence>
      <motion.div
        key="splash"
        className="fixed inset-0 z-9999 bg-ink flex flex-col items-center justify-center overflow-hidden"
        animate={splashPhase === 'expand' ? { scale: 20, opacity: 0 } : {}}
        transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
      >
        <motion.div
          animate={splashPhase === 'logo' ? { opacity: [1, 0.5, 1] } : { scale: 1 }}
          transition={splashPhase === 'logo' ? { repeat: Infinity, duration: 1.4 } : {}}
          className="flex flex-col items-center gap-6"
        >
          <F1Logo className="w-32 h-auto" color="#cc0000" />
          <div className="text-[9px] font-black uppercase tracking-[0.8em] text-muted">Strategy Center // 2026</div>
        </motion.div>
        {splashPhase === 'logo' && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-[8px] font-black uppercase tracking-[0.6em] text-muted">Initializing</span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-ink text-white selection:bg-accent selection:text-white">
      <nav className="studio-header px-8 md:px-16 py-8 flex justify-between items-center">
        <div className="flex items-center gap-8 group cursor-pointer" onClick={() => window.location.reload()}>
           <F1Logo className="w-16 h-auto" color="#cc0000" />
           <div className="hidden md:block h-8 w-px bg-white/10" />
           <div className="hidden md:flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.5em] text-muted leading-none">Strategy Center</span>
              <span className="text-[8px] font-bold text-accent uppercase tracking-[0.2em] mt-1">Ref 2026 // Studio Standard</span>
           </div>
        </div>

        <div className="flex items-center gap-10">
          <div className="hidden lg:flex gap-12 text-[11px] font-black uppercase tracking-[0.3em] text-muted font-bold">
             {NAV_ITEMS.map(item => (
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
            {effectiveLive && demoActive && (
              <div className="flex items-center gap-3 px-6 py-2.5 rounded-full border border-white/20 bg-white/10 text-[10px] font-black tracking-widest text-white">
                <div className="w-2 h-2 rounded-full bg-white" />
                DEMO
              </div>
            )}
            {liveOverride !== null && (
              <button
                type="button"
                onClick={resetLiveOverrideToAuto}
                className="text-[9px] font-black uppercase tracking-widest text-muted hover:text-white transition-colors px-3 py-1 rounded-full border border-white/10 cursor-pointer"
              >
                AUTO
              </button>
            )}
            <motion.button
              type="button"
              onClick={toggleLiveOverride}
              aria-pressed={effectiveLive}
              animate={effectiveLive ? { opacity: [1, 0.6, 1] } : {}}
              className={`flex items-center gap-3 px-6 py-2.5 rounded-full border text-[10px] font-black tracking-widest transition-all cursor-pointer focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${effectiveLive ? 'bg-accent border-accent shadow-xl shadow-accent/20' : 'bg-white/5 border-white/10 text-muted'}`}
            >
              <div className={`w-2 h-2 rounded-full ${effectiveLive ? 'bg-white shadow-[0_0_10px_white]' : 'bg-muted'}`} />
              {effectiveLive ? 'LIVE SESSION' : 'OFFLINE'}
            </motion.button>
            <button className="lg:hidden p-3 bg-white/5 rounded-xl text-white" onClick={() => setMobileMenuOpen(true)}><Menu size={24} /></button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="fixed inset-0 z-300 bg-ink p-12 flex flex-col justify-center gap-12">
             <button className="absolute top-12 right-12 p-4 bg-white/5 rounded-full text-white" onClick={() => setMobileMenuOpen(false)}><X size={40} /></button>
             {MOBILE_MENU_ITEMS.map((item) => (
               <div key={item} className="text-6xl font-black italic tracking-tighter hover:text-accent transition-all cursor-pointer uppercase" onClick={() => setMobileMenuOpen(false)}>{item}</div>
             ))}
          </motion.div>
        )}
      </AnimatePresence>

      <main
        className={`px-8 md:px-16 pb-8 md:pb-16 max-w-[1920px] mx-auto overflow-hidden ${
          effectiveLive ? "pt-4 md:pt-6" : "pt-8 md:pt-16"
        }`}
      >
        <AnimatePresence mode="wait">
          {effectiveLive ? (
            <motion.div key="live" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
               <LiveDashboard demoActive={demoActive} onToggleDemo={toggleDemo} />
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-24">
              <NextRaceHero onOpenBriefing={() => setActiveModal('next_race')} />
              <StandingsSection onOpenArchive={() => setActiveModal('standings')} onSelectProfile={openCareerProfile} />
              <SeasonSections onSelectCircuit={setSelectedCircuit} />
              <NewsSection />
              <ArchiveHeading onOpenSchedule={() => setActiveModal('schedule')} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="p-16 border-t border-white/5 text-center bg-white/1">
         <div className="flex flex-col items-center gap-6">
            <div className="h-0.5 w-32 bg-accent/40 rounded-full" />
            <div className="text-[9px] font-bold text-muted uppercase tracking-[0.6em] opacity-40 italic">F1D Strategy Center // 2026</div>
         </div>
      </footer>

      <StandingsModal isOpen={activeModal === 'standings'} onClose={() => setActiveModal(null)} onSelectProfile={openCareerProfile} />
      <ScheduleModal isOpen={activeModal === 'schedule'} onClose={() => setActiveModal(null)} onSelectCircuit={setSelectedCircuit} />
      <BriefingModal isOpen={activeModal === 'next_race'} onClose={() => setActiveModal(null)} />
      <CircuitDetailsModal isOpen={!!selectedCircuit} onClose={() => setSelectedCircuit(null)} circuit={selectedCircuit} onDriverClick={(driverId) => openCareerProfile('driver', driverId)} />
      <CareerModal isOpen={!!careerProfile} onClose={() => setCareerProfile(null)} type={careerProfile?.type} id={careerProfile?.id} />
    </div>
  );
}
