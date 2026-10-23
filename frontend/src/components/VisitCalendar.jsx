import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DOT = { scheduled: "bg-[#457B9D]", completed: "bg-[#2D6A4F]", no_show: "bg-[#C25934]", cancelled: "bg-forest/40" };
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const VisitCalendar = ({ visits, leads, projects }) => {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(null);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i - first.getDay() + 1));
  const byDay = visits.reduce((acc, v) => { const k = new Date(v.scheduled_at).toDateString(); (acc[k] = acc[k] || []).push(v); return acc; }, {});
  const today = new Date().toDateString();
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const name = (v) => leads.find((l) => l.id === v.lead_id)?.name || "Visit";
  const time = (v) => new Date(v.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const selectedVisits = selected ? (byDay[selected] || []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)) : [];

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4" data-testid="visit-calendar">
      <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-hidden">
        <div className="p-4 border-b border-[#E6E4DD] flex items-center justify-between">
          <button data-testid="calendar-prev" onClick={() => shift(-1)} className="h-8 w-8 border border-[#E6E4DD] rounded-sm grid place-items-center hover:border-forest transition-colors duration-150"><ChevronLeft className="h-4 w-4" /></button>
          <div className="flex items-center gap-3">
            <div data-testid="calendar-month" className="font-display font-bold text-xl text-forest">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
            <button data-testid="calendar-today" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="text-[10px] uppercase tracking-[0.18em] font-bold text-clay hover:text-forest transition-colors duration-150">Today</button>
          </div>
          <button data-testid="calendar-next" onClick={() => shift(1)} className="h-8 w-8 border border-[#E6E4DD] rounded-sm grid place-items-center hover:border-forest transition-colors duration-150"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7">
          {WEEK.map((d) => <div key={d} className="p-2 border-b border-r border-[#E6E4DD] bg-bone-alt/50 text-[10px] uppercase tracking-[0.14em] text-forest/50">{d}</div>)}
          {days.map((day) => {
            const k = day.toDateString(); const entries = byDay[k] || []; const inMonth = day.getMonth() === month.getMonth();
            return (
              <button key={k} data-testid={`calendar-day-${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`} onClick={() => setSelected(k)}
                className={`min-h-24 p-1.5 border-b border-r border-[#E6E4DD] text-left align-top transition-colors duration-150 ${inMonth ? "bg-white" : "bg-bone-alt/25 text-forest/35"} ${selected === k ? "ring-2 ring-inset ring-forest" : "hover:bg-bone-alt/40"}`}>
                <div className={`text-xs font-bold mb-1 inline-grid place-items-center h-5 min-w-5 px-1 rounded-sm ${k === today ? "bg-clay text-white" : ""}`}>{day.getDate()}</div>
                <div className="space-y-0.5">
                  {entries.slice(0, 3).map((v) => (
                    <div key={v.id} className="flex items-center gap-1 text-[10px] text-forest truncate">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOT[v.status] || DOT.scheduled}`} /><b>{time(v)}</b><span className="truncate">{name(v)}</span>
                    </div>
                  ))}
                  {entries.length > 3 && <div className="text-[10px] text-forest/55">+{entries.length - 3} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="border border-[#E6E4DD] bg-white rounded-sm p-4" data-testid="calendar-day-panel">
        <div className="label-caps">{selected ? new Date(selected).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }) : "Pick a day"}</div>
        <div className="mt-3 space-y-2">
          {selected && selectedVisits.length === 0 && <div className="text-sm text-forest/50">No visits on this day.</div>}
          {selectedVisits.map((v) => (
            <Link key={v.id} to={`/leads/${v.lead_id}`} data-testid={`calendar-visit-${v.id}`} className="block border border-[#E6E4DD] rounded-sm p-3 hover:border-forest transition-colors duration-150">
              <div className="flex items-center justify-between"><span className="font-display font-bold text-forest tabular-nums">{time(v)}</span><span className="text-[9px] uppercase tracking-[0.15em] font-bold text-forest/50">{v.status.replace("_", " ")}</span></div>
              <div className="text-sm text-forest mt-1">{name(v)}</div>
              <div className="text-[11px] text-forest/50">{projects.find((p) => p.id === v.project_id)?.name || ""}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
