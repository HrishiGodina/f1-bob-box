import type { LucideIcon } from 'lucide-react';

export const SectionHeader = ({ icon: Icon, title, id }: { icon: LucideIcon; title: string; id?: string }) => (
  <div className="flex items-center justify-between mb-12" id={id}>
    <div className="flex items-center gap-4">
      <div className="p-3 bg-white/5 rounded-2xl text-accent">
        <Icon size={24} />
      </div>
      <h2 className="text-3xl font-black uppercase tracking-widest italic text-white">
        {title}
      </h2>
    </div>
    <div className="h-px flex-1 bg-white/10 ml-8 hidden md:block" />
  </div>
);
