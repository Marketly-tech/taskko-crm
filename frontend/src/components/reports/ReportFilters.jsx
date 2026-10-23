import React from "react";
import { SOURCE_LABEL } from "@/lib/api";
import { CalendarRange, RefreshCcw } from "lucide-react";

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

export const PRESETS = [
  { key: "7d", label: "7 days", range: () => [daysAgo(6), iso(new Date())] },
  { key: "30d", label: "30 days", range: () => [daysAgo(29), iso(new Date())] },
  { key: "90d", label: "90 days", range: () => [daysAgo(89), iso(new Date())] },
  { key: "180d", label: "6 months", range: () => [daysAgo(179), iso(new Date())] },
  { key: "ytd", label: "This year", range: () => [`${new Date().getFullYear()}-01-01`, iso(new Date())] },
];

export const initialReportFilters = () => {
  const [start, end] = PRESETS[3].range();
  return { preset: "180d", start, end, date_field: "created", source: "all", assigned_to: "all" };
};

const inputCls = "mt-1 w-full h-9 border border-[#E6E4DD] rounded-sm px-2 text-sm text-forest bg-white focus:outline-none focus:border-forest";

export const ReportFilters = ({ value, onChange, onApply, users, busy, showUser = true }) => {
  const set = (k, v) => onChange({ ...value, [k]: v, ...(k === "start" || k === "end" ? { preset: "" } : {}) });
  const preset = (p) => { const [start, end] = p.range(); onChange({ ...value, preset: p.key, start, end }); };
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm p-4 space-y-4" data-testid="report-filters">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-forest font-medium text-sm"><CalendarRange className="h-4 w-4" /> Date range applies to every report below</div>
        <div className="flex items-center gap-1 flex-wrap">
          {PRESETS.map((p) => (
            <button key={p.key} data-testid={`report-preset-${p.key}`} onClick={() => preset(p)}
              className={`h-8 px-3 rounded-sm text-xs font-medium border transition-colors duration-150 ${value.preset === p.key ? "bg-forest text-white border-forest" : "bg-white text-forest border-[#E6E4DD] hover:border-forest"}`}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        <label className="text-xs text-forest/60">From<input data-testid="report-start" type="date" value={value.start} onChange={(e) => set("start", e.target.value)} className={inputCls} /></label>
        <label className="text-xs text-forest/60">To<input data-testid="report-end" type="date" value={value.end} onChange={(e) => set("end", e.target.value)} className={inputCls} /></label>
        <label className="text-xs text-forest/60">Lead date uses
          <select data-testid="report-date-field" value={value.date_field} onChange={(e) => set("date_field", e.target.value)} className={inputCls}>
            <option value="created">Created date</option><option value="updated">Last updated</option>
          </select>
        </label>
        <label className="text-xs text-forest/60">Source
          <select data-testid="report-source" value={value.source} onChange={(e) => set("source", e.target.value)} className={inputCls}>
            <option value="all">All sources</option>
            {Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {showUser && <label className="text-xs text-forest/60">User
          <select data-testid="report-user" value={value.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} className={inputCls}>
            <option value="all">All users</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>}
        <button data-testid="report-apply" onClick={onApply} disabled={busy} className="h-9 px-3 bg-forest text-white rounded-sm text-sm inline-flex items-center justify-center gap-2 hover:bg-forest-soft disabled:opacity-60 transition-colors duration-150">
          <RefreshCcw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Apply
        </button>
      </div>
    </div>
  );
};
