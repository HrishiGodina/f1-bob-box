import type { RaceControlMessage } from "./types";

// Best-effort classification from message text. F1's own Category field
// (when present) is coarse ("Flag", "Other", ...), so the real color cue
// comes from matching well-known phrases in Message. Anything
// unrecognised falls back to a neutral style rather than guessing wrong —
// same fail-soft-by-default spirit as handoff §7 decision 4.
function messageStyle(message: string): { bar: string; text: string } {
  const upper = message.toUpperCase();
  if (upper.includes("RED FLAG")) return { bar: "bg-red-600", text: "text-red-400" };
  if (upper.includes("YELLOW FLAG") || upper.includes("DOUBLE YELLOW")) {
    return { bar: "bg-yellow-400", text: "text-yellow-300" };
  }
  if (upper.includes("GREEN")) return { bar: "bg-emerald-500", text: "text-emerald-400" };
  if (upper.includes("SAFETY CAR") || upper.includes("VSC")) return { bar: "bg-orange-500", text: "text-orange-400" };
  if (upper.includes("CHEQUERED")) return { bar: "bg-white", text: "text-white" };
  if (upper.includes("DRS")) return { bar: "bg-sky-500", text: "text-sky-400" };
  if (upper.includes("INVESTIGAT") || upper.includes("PENALTY")) return { bar: "bg-mkbhd-red", text: "text-mkbhd-red" };
  return { bar: "bg-white/20", text: "text-mkbhd-gray" };
}

export interface RaceControlTickerProps {
  messages: RaceControlMessage[];
}

// A compact, single-row glance strip — the tall scrolling card
// (RaceControlFeed) is gone; this shows only the single most recent
// message plus a count badge for anything older, so Race Control costs
// one row of vertical space instead of a min-h-[400px] card. messages is
// already newest-first because the backend prepends new messages to the
// front of the list, so no re-sorting happens here — re-sorting would be
// a second, independent ordering decision.
export function RaceControlTicker({ messages }: RaceControlTickerProps) {
  const [latest, ...rest] = messages;
  const text = latest?.Message ?? (latest ? JSON.stringify(latest) : "");
  const style = latest ? messageStyle(text) : null;

  return (
    <div className="mkbhd-card px-6 py-3 flex items-center gap-4 min-h-[56px]">
      <h2 className="text-xs font-black uppercase tracking-[0.3em] flex-shrink-0">Race Control</h2>
      {latest && style ? (
        <>
          <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${style.bar}`} />
          <div className="min-w-0 flex-1 truncate">
            <span className={`text-sm font-bold uppercase italic ${style.text}`}>
              {text}
            </span>
          </div>
          {rest.length > 0 && (
            <div className="text-[10px] font-mono text-mkbhd-gray flex-shrink-0">+{rest.length} more</div>
          )}
        </>
      ) : (
        <div className="text-mkbhd-gray text-xs uppercase tracking-widest">No messages yet</div>
      )}
    </div>
  );
}
