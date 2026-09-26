import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export const StudioModal = ({ isOpen, onClose, title, children }: {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);
  return (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-200 flex items-center justify-center p-0 md:p-8">
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
