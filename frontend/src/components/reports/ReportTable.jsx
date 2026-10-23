import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

export function downloadCsv(name, rows) {
  if (!rows.length) return toast.error("There is no data to export for this period.");
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const ReportSection = ({ eyebrow, title, csvName, rows, testId, children }) => (
  <section data-testid={testId} className="space-y-3">
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="label-caps">{eyebrow}</div>
        <h3 className="font-display font-bold text-xl text-forest tracking-tight mt-1">{title}</h3>
      </div>
      {csvName && (
        <button data-testid={`${testId}-csv`} onClick={() => downloadCsv(csvName, rows || [])} className="h-8 px-3 border border-[#E6E4DD] bg-white rounded-sm text-xs text-forest inline-flex items-center gap-1.5 hover:border-forest transition-colors duration-150">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      )}
    </div>
    {children}
  </section>
);

export const ReportTable = ({ columns, rows, testId, empty = "No records in this period." }) => {
  const [sort, setSort] = useState({ key: null, dir: "desc" });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sort.key] ?? ""; const bv = b[sort.key] ?? "";
      const r = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort]);
  const toggle = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-auto max-h-[480px]" data-testid={testId}>
      <table className="w-full min-w-max text-sm">
        <thead className="bg-bone-alt/80 border-b border-[#E6E4DD] sticky top-0 z-10">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-[0.12em] text-forest/60 whitespace-nowrap font-bold">
                <button onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-forest transition-colors duration-150">
                  {c.label}<span className="text-forest/30">{sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E6E4DD]">
          {sorted.map((r, i) => (
            <tr key={r.id || r.user_id || r.date || r.source || r.reason || i} className="hover:bg-bone-alt/30 transition-colors duration-100">
              {columns.map((c) => <td key={c.key} className="px-3 py-2.5 text-forest whitespace-nowrap tabular-nums">{c.render ? c.render(r[c.key], r) : r[c.key] ?? "—"}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-forest/50">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

export const Metric = ({ label, value, sub, onClick, testId }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag data-testid={testId} onClick={onClick} className={`text-left border border-[#E6E4DD] bg-white rounded-sm p-4 ${onClick ? "hover:border-forest transition-colors duration-150" : ""}`}>
      <div className="label-caps">{label}</div>
      <div className="font-display font-black text-2xl text-forest mt-2 tabular-nums">{value ?? 0}</div>
      {sub && <div className="text-[11px] text-forest/50 mt-1">{sub}</div>}
    </Tag>
  );
};
