import React, { useState } from "react";
import { api } from "@/lib/api";
import { CONSOLE } from "@/constants/testIds";
import { Switch } from "@/components/ui/switch";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const HEADERS = ["name", "phone", "email", "source", "project_name", "budget_min", "budget_max", "configuration", "location_pref", "notes"];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
    return row;
  });
}

export default function DataImport() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [autoAssign, setAutoAssign] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      setRows(parsed);
    };
    reader.readAsText(f);
  };

  const runImport = async () => {
    if (rows.length === 0) { toast.error("Nothing to import"); return; }
    setBusy(true);
    try {
      const body = {
        rows: rows.map((r) => ({
          name: r.name,
          phone: r.phone || null,
          email: r.email || null,
          source: r.source || "manual",
          project_name: r.project_name || null,
          budget_min: r.budget_min ? Number(r.budget_min) : null,
          budget_max: r.budget_max ? Number(r.budget_max) : null,
          configuration: r.configuration || null,
          location_pref: r.location_pref || null,
          notes: r.notes || null,
        })).filter((r) => r.name),
        auto_assign: autoAssign,
      };
      const { data } = await api.post("/leads/import", body);
      setResult(data);
      toast.success(`Imported ${data.created} leads (${data.failed} skipped)`);
    } catch (e) { toast.error("Import failed"); }
    finally { setBusy(false); }
  };

  const sampleCsv = "name,phone,email,source,project_name,budget_min,configuration\nAsha Kumar,+91 9812345678,asha@example.com,website,Aurelia Heights,15000000,3BHK\nRohit Sen,+91 9823456789,rohit@example.com,magicbricks,Meridian Bay,45000000,4BHK";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="label-caps">Console</div>
        <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Data import</h2>
        <div className="text-sm text-forest/60 mt-1">Upload a CSV to bulk-create leads. Supported columns:</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {HEADERS.map((h) => <span key={h} className="text-[10px] uppercase tracking-[0.15em] font-mono font-bold text-forest border border-[#E6E4DD] rounded-sm px-1.5 py-0.5">{h}</span>)}
        </div>
      </div>

      <label className="block border-2 border-dashed border-[#E6E4DD] rounded-sm p-10 text-center hover:border-forest transition-colors duration-150 cursor-pointer bg-white">
        <input data-testid={CONSOLE.importFile} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        <UploadCloud className="h-8 w-8 mx-auto text-forest/60 mb-3" />
        <div className="text-sm text-forest font-medium">{fileName || "Drop a CSV or click to browse"}</div>
        <div className="text-xs text-forest/50 mt-1">{rows.length ? `${rows.length} rows detected` : "First row = column headers"}</div>
      </label>

      <div className="flex items-center gap-3 border border-[#E6E4DD] bg-white rounded-sm p-4">
        <Switch checked={autoAssign} onCheckedChange={setAutoAssign} />
        <div className="text-sm text-forest flex-1">Auto-assign imported leads to executives (least-loaded first)</div>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => { navigator.clipboard.writeText(sampleCsv); toast.success("Sample copied"); }}
          className="text-xs uppercase tracking-[0.18em] font-bold text-forest hover:text-clay transition-colors duration-150 inline-flex items-center gap-1.5"
        >
          <FileText className="h-3.5 w-3.5" /> Copy sample CSV
        </button>
        <button
          data-testid={CONSOLE.importBtn}
          onClick={runImport}
          disabled={busy || rows.length === 0}
          className="h-10 px-5 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-60"
        >
          {busy ? "Importing…" : `Import ${rows.length} rows`}
        </button>
      </div>

      {result && (
        <div className="border border-[#2D6A4F]/30 bg-[#2D6A4F]/5 text-forest rounded-sm p-4 flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-[#2D6A4F]" />
          <div className="text-sm"><span className="font-bold text-[#2D6A4F]">{result.created} leads</span> imported. <span className="text-forest/60">{result.failed} skipped.</span></div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-bone-alt/60 border-b border-[#E6E4DD]">
              <tr className="text-[10px] uppercase tracking-[0.15em] text-forest/70">
                {Object.keys(rows[0]).slice(0, 6).map((h) => <th key={h} className="text-left px-3 py-2 font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E4DD]">
              {rows.slice(0, 15).map((r, i) => (
                <tr key={i}>
                  {Object.keys(rows[0]).slice(0, 6).map((h) => <td key={h} className="px-3 py-2 text-forest/70 truncate max-w-[180px]">{r[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 15 && <div className="px-3 py-2 text-[10px] text-forest/50 border-t border-[#E6E4DD]">…and {rows.length - 15} more rows</div>}
        </div>
      )}
    </div>
  );
}
