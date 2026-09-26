import { StudioButton } from '../../shared/ui/StudioButton';

export interface ArchiveHeadingProps {
  onOpenSchedule: () => void;
}

export function ArchiveHeading({ onOpenSchedule }: ArchiveHeadingProps) {
  return (
    <section className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-12">
        <h2 className="text-[12vw] tracking-tighter leading-none">THE <span className="text-mkbhd-red italic">ARCHIVE</span></h2>
        <StudioButton variant="secondary" className="px-16 py-6 text-sm mt-6 md:mt-0" onClick={onOpenSchedule}>Full Season Timeline</StudioButton>
      </div>
    </section>
  );
}
