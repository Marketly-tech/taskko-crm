import React, { useState } from "react";
import { CalendarRange } from "lucide-react";

const fmt = (d) => d.toLocaleDateString("en-CA");
const today = () => new Date();

export const DASH_PRESETS = [
  { key: "today", label: "Today", range: () => [fmt(today()), fmt(today())] },
  { key: "week", label: "This week", range: () => { const d = today(); const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [fmt(m), fmt(d)]; } },
  { key: "month", label: "This month", range: () => { const d = today(); return [fmt(new Date(d.getFullYear(), d.getMonth(), 1)), fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; } },
  { key: "last_month", label: "Last month", range: () => { const d = today(); return [fmt(new Date(d.getFullYear(), d.getMonth() - 1, 1)), fmt(new Date(d.getFullYear(), d.getMonth(), 0))]; } },
  { key: "30d", label: "Last 30 days", range: () => [fmt(new Date(Date.now() - 29 * 86400000)), fmt(today())] },
];

export const initialDashRange = () => { const [from, to] = DASH_PRESETS[2].range(); return { preset: "month", from, to }; };

export const prettyRange = ({ from, to }) => {
  const f = (s) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
};

const inputCls = "h-8 border border-[#E6E4DD] rounded-sm px-2 text-xs text-forest bg-white focus:outline-none focus:border-forest";

export const DashboardRangeBar = ({ value, onChange }) => {
  const [draft, setDraft] = useState({ from: value.from, to: value.to });
  const pick = (p) => { const [from, to] = p.range(); setDraft({ from, to }); onChange({ preset: p.key, from, to }); };
  const apply = () => draft.from && draft.to && draft.from <= draft.to && onChange({ preset: "custom", ...draft });
  return (
    <div data-testid="dash-range-bar" className="border border-[#E6E4DD] bg-white rounded-sm px-4 py-3 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm text-forest font-medium"><CalendarRange className="h-4 w-4" /> Period</div>
      <div className="flex gap-1 flex-wrap">
        {DASH_PRESETS.map((p) => (
          <button key={p.key} data-testid={`dash-preset-${p.key}`} onClick={() => pick(p)}
            className={`h-8 px-3 rounded-sm text-xs font-medium border transition-colors duration-150 ${value.preset === p.key ? "bg-forest text-white border-forest" : "bg-white text-forest border-[#E6E4DD] hover:border-forest"}`}>{p.label}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <input data-testid="dash-range-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputCls} />
        <span className="text-xs text-forest/50">to</span>
        <input data-testid="dash-range-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputCls} />
        <button data-testid="dash-range-apply" onClick={apply} disabled={!draft.from || !draft.to || draft.from > draft.to}
          className="h-8 px-3 rounded-sm bg-forest text-white text-xs font-medium hover:bg-forest-soft disabled:opacity-50 transition-colors duration-150">Apply</button>
      </div>
    </div>
  );
};
