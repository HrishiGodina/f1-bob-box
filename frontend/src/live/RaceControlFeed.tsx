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

export interface RaceControlFeedProps {
  messages: RaceControlMessage[];
}

// messages is already newest-first — LiveSessionState prepends on the
// backend (backend/livetiming/state.py, Task 3), so this component only
// renders in the order it's given; re-sorting here would be a second,
// independent ordering decision the frontend has no business making.
//
// The array index is used as the React key. RaceControlMessage (handoff
// §3.6) carries no verified stable identifier field, so an index key is
// the honest choice here rather than inventing one; the practical effect
// is that inserting a new message at the front re-keys every row below
// it, which is fine for a short list bounded by RACE_CONTROL_MAX (100).
export function RaceControlFeed({ messages }: RaceControlFeedProps) {
  return (
    <div className="mkbhd-card p-10 flex flex-col min-h-[400px]">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xs font-black uppercase tracking-[0.3em]">Race Control</h2>
        <div className="text-[10px] font-mono text-mkbhd-gray">{messages.length} MSG</div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 max-h-[500px]">
        {messages.length === 0 && (
          <div className="text-mkbhd-gray text-xs uppercase tracking-widest text-center py-12">No messages yet</div>
        )}
        {messages.map((msg, i) => {
          const text = msg.Message ?? JSON.stringify(msg);
          const style = messageStyle(text);
          return (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${style.bar}`} />
              <div className="min-w-0">
                {msg.Category && (
                  <div className="text-[9px] font-black text-mkbhd-gray uppercase tracking-widest mb-1">
                    {msg.Category}
                  </div>
                )}
                <div className={`text-sm font-bold uppercase italic leading-snug ${style.text}`}>{text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
