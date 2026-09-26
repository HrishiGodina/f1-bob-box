import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  if (upper.includes("INVESTIGAT") || upper.includes("PENALTY")) return { bar: "bg-accent", text: "text-accent" };
  return { bar: "bg-white/20", text: "text-muted" };
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
// How long a freshly-arrived message stays in its attention-grabbing state
// before settling into the normal static row.
const HIGHLIGHT_MS = 5000;

export function RaceControlTicker({ messages }: RaceControlTickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [latest, ...rest] = messages;
  const text = latest?.Message ?? (latest ? JSON.stringify(latest) : "");
  const style = latest ? messageStyle(text) : null;
  const canExpand = rest.length > 0;

  // Fires the attention animation only when the *content* of the latest
  // message changes, not on every re-render — a ref tracks what's already
  // been announced so an unrelated parent re-render doesn't replay it.
  const [highlighted, setHighlighted] = useState(false);
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!text || announcedRef.current === text) return;
    announcedRef.current = text;
    setHighlighted(true);
    const timer = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div
      className={`panel px-6 py-3 transition-colors duration-500 ${
        highlighted ? "bg-accent/10 border border-accent/50" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        className={`w-full flex items-center gap-4 min-h-[32px] text-left ${canExpand ? "cursor-pointer" : "cursor-default"}`}
      >
        <h2 className="text-xs font-black uppercase tracking-[0.3em] shrink-0">Race Control</h2>
        {latest && style ? (
          <>
            <div className={`w-1 self-stretch rounded-full shrink-0 ${style.bar}`} />
            <div className="min-w-0 flex-1 truncate">
              <AnimatePresence mode="wait">
                <motion.span
                  key={text}
                  initial={{ opacity: 0, x: -12, scale: 0.96 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    scale: highlighted ? [0.96, 1.05, 1] : 1,
                  }}
                  transition={{ duration: 0.4, scale: { duration: 0.6, times: [0, 0.5, 1] } }}
                  className={`text-sm font-bold uppercase italic inline-block ${style.text}`}
                >
                  {text}
                </motion.span>
              </AnimatePresence>
            </div>
            {canExpand && (
              <div className="flex items-center gap-1 text-[10px] font-mono text-muted shrink-0">
                +{rest.length} more
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted text-xs uppercase tracking-widest">No messages yet</div>
        )}
      </button>

      {expanded && canExpand && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
          {rest.map((message, index) => {
            const messageText = message.Message ?? JSON.stringify(message);
            const messageStyleInfo = messageStyle(messageText);
            return (
              <div key={index} className="flex items-center gap-4">
                <div className={`w-1 h-4 rounded-full shrink-0 ${messageStyleInfo.bar}`} />
                <span className={`text-sm font-bold uppercase italic ${messageStyleInfo.text}`}>
                  {messageText}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
