import { motion } from 'framer-motion';
import { Newspaper, Eye, ChevronRight } from 'lucide-react';
import { SectionHeader } from '../../shared/ui/SectionHeader';
import { useIdleData } from '../../shared/api/useIdleData';

export function NewsSection() {
  const { data: idleData } = useIdleData();

  return (
    <section className="space-y-12" id="news">
      <SectionHeader icon={Newspaper} title="Global Dispatch" />
      <div className="flex gap-8 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide">
        {idleData?.news?.map((n, i) => (
          <motion.a whileHover={{ y: -8, scale: 0.99 }} key={i} href={n.links?.web?.href} target="_blank" className="panel group flex flex-col bg-white/1 overflow-hidden border-white/10 rounded-4xl shadow-2xl shrink-0 w-72">
            <div className="h-44 relative overflow-hidden bg-ink">
              <img src={n.images?.[0]?.url} className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 group-hover:scale-105" alt={n.headline} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <div className="absolute inset-0 bg-linear-to-t from-ink via-transparent to-transparent opacity-80" />
              <div className="absolute top-4 left-4 px-3 py-1.5 bg-accent/80 backdrop-blur-md rounded-md text-[8px] font-black uppercase tracking-widest text-white italic">DISPATCH</div>
            </div>
            <div className="p-6 space-y-4 flex-1">
              <h3 className="text-xl font-black leading-tight text-white group-hover:text-accent transition-colors uppercase italic">{n.headline}</h3>
              <p className="text-xs text-muted font-bold line-clamp-2 leading-relaxed uppercase tracking-tight opacity-60 group-hover:opacity-100 transition-opacity">{n.description}</p>
              <div className="pt-4 border-t border-white/5 flex items-center gap-3 text-accent text-[9px] font-black uppercase tracking-[0.4em]">
                <Eye size={13} /> READ <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.a>
        ))}
      </div>
    </section>
  );
}
