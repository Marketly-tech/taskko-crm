import React, { useEffect, useMemo, useState } from "react";
import { api, inr, formatApiError } from "@/lib/api";
import { useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { INVENTORY } from "@/constants/testIds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Download, UploadCloud, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const STATUS_COLORS = {
  available: "bg-[#2D6A4F]/10 text-[#2D6A4F] border-[#2D6A4F]/30",
  held: "bg-[#D4A373]/20 text-[#8A5A2B] border-[#D4A373]/40",
  booked: "bg-[#C25934]/10 text-[#C25934] border-[#C25934]/30",
  sold: "bg-forest/10 text-forest border-forest/30",
};

const STATUS_ORDER = ["available", "held", "booked", "sold"];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
    return row;
  });
}

function UnitEditor({ unit, onSaved, canEdit }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  useEffect(() => {
    if (open) setForm({
      tower: unit.tower || "", floor: unit.floor ?? 1, unit_no: unit.unit_no || "",
      config: unit.config || "", carpet_area: unit.carpet_area ?? "",
      price: unit.price ?? "", facing: unit.facing || "", status: unit.status || "available",
    });
  }, [open, unit]);
  const submit = async () => {
    try {
      const body = { ...form };
      body.floor = Number(body.floor);
      body.carpet_area = body.carpet_area === "" ? null : Number(body.carpet_area);
      body.price = body.price === "" ? null : Number(body.price);
      Object.keys(body).forEach((k) => { if (body[k] === null || body[k] === "") delete body[k]; });
      await api.patch(`/units/${unit.id}`, body);
      toast.success(`${form.unit_no} saved`);
      setOpen(false);
      onSaved?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => canEdit && setOpen(v)}>
      <DialogTrigger asChild>
        <button
          data-testid={INVENTORY.unitCell(unit.id)}
          className={`border rounded-sm px-3 h-11 min-w-[86px] text-left transition-colors duration-150 hover:border-forest ${STATUS_COLORS[unit.status] || ""}`}
          title={`${unit.unit_no} · ${unit.config} · ${inr(unit.price)} · click to edit`}
        >
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold leading-none">{unit.unit_no}</div>
          <div className="text-[10px] mt-1 opacity-75">{unit.config}</div>
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-2xl">Edit unit {unit.unit_no}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <F label="Tower" value={form.tower} onChange={(v) => setForm({ ...form, tower: v })} />
          <F label="Floor" type="number" value={form.floor} onChange={(v) => setForm({ ...form, floor: v })} />
          <F label="Unit no" value={form.unit_no} onChange={(v) => setForm({ ...form, unit_no: v })} />
          <F label="Config" value={form.config} onChange={(v) => setForm({ ...form, config: v })} />
          <F label="Carpet area (sqft)" type="number" value={form.carpet_area} onChange={(v) => setForm({ ...form, carpet_area: v })} />
          <F label="Price (₹)" type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
          <F label="Facing" value={form.facing} onChange={(v) => setForm({ ...form, facing: v })} />
          <div>
            <div className="label-caps mb-1.5">Status</div>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <button data-testid="unit-save-btn" onClick={submit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Save unit</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <div className="label-caps mb-1.5">{label}</div>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
    </div>
  );
}

function ImportDialog({ projectId, onDone }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setRows(parseCsv(String(reader.result)));
    reader.readAsText(f);
  };
  const submit = async () => {
    if (!projectId) { toast.error("Pick a project first"); return; }
    setBusy(true);
    try {
      const body = {
        project_id: projectId,
        replace_existing: replace,
        rows: rows.map((r) => ({
          tower: r.tower, floor: Number(r.floor || 0), unit_no: r.unit_no,
          config: r.config, carpet_area: r.carpet_area ? Number(r.carpet_area) : null,
          price: r.price ? Number(r.price) : null, facing: r.facing || null,
          status: (r.status || "available"),
        })).filter((r) => r.tower && r.unit_no && r.config),
      };
      const { data } = await api.post("/units/import", body);
      toast.success(`Imported ${data.created}${replace ? " (replaced existing)" : ""}`);
      setOpen(false); setRows([]); setFileName("");
      onDone?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button data-testid="inv-import-btn" className="h-9 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center gap-2 px-3">
          <UploadCloud className="h-4 w-4" /> Import CSV
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-2xl">Import units</DialogTitle></DialogHeader>
        <div className="text-xs text-forest/60">Required columns: <code>tower, floor, unit_no, config</code>. Optional: <code>carpet_area, price, facing, status</code>.</div>
        <label className="block border-2 border-dashed border-[#E6E4DD] rounded-sm p-6 text-center hover:border-forest transition-colors duration-150 cursor-pointer">
          <input type="file" accept=".csv" onChange={onFile} className="hidden" data-testid="inv-import-file" />
          <UploadCloud className="h-6 w-6 mx-auto text-forest/60 mb-2" />
          <div className="text-sm text-forest">{fileName || "Drop CSV or click to browse"}</div>
          {rows.length > 0 && <div className="text-xs text-forest/50 mt-1">{rows.length} rows detected</div>}
        </label>
        <div className="flex items-center gap-3">
          <Switch checked={replace} onCheckedChange={setReplace} />
          <div className="text-sm text-forest">Replace all existing units in this project</div>
        </div>
        <DialogFooter>
          <button data-testid="inv-import-submit" disabled={busy || rows.length === 0} onClick={submit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">
            {busy ? "Importing…" : `Import ${rows.length} units`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const { projects, activeId } = useProjects();
  const [units, setUnits] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState(activeId && activeId !== "__all__" ? activeId : (projects[0]?.id || ""));
  const canEdit = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (!projectFilter && projects.length > 0) setProjectFilter(projects[0].id);
  }, [projects, projectFilter]);

  const load = async () => {
    if (!projectFilter) { setUnits([]); return; }
    const { data } = await api.get("/units", { params: { project_id: projectFilter } });
    setUnits(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectFilter]);

  const filtered = useMemo(() => units.filter((u) => !statusFilter || u.status === statusFilter), [units, statusFilter]);

  const byTower = useMemo(() => {
    const g = {};
    filtered.forEach((u) => {
      const t = u.tower || "A";
      g[t] = g[t] || {};
      g[t][u.floor] = g[t][u.floor] || [];
      g[t][u.floor].push(u);
    });
    Object.keys(g).forEach((t) => {
      Object.keys(g[t]).forEach((f) => g[t][f].sort((a, b) => (a.unit_no || "").localeCompare(b.unit_no || "")));
    });
    return g;
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { available: 0, held: 0, booked: 0, sold: 0 };
    units.forEach((u) => { if (c[u.status] != null) c[u.status]++; });
    return c;
  }, [units]);

  const exportCsv = () => {
    if (!projectFilter) { toast.error("Pick a project first"); return; }
    window.location.href = `${BACKEND}/api/units/export?project_id=${projectFilter}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label-caps">Inventory</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Unit matrix</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-[220px] h-9 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Pick project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter || "__all__"} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger data-testid={INVENTORY.statusFilter} className="w-[140px] h-9 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <button data-testid="inv-export-btn" onClick={exportCsv} className="h-9 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center gap-2 px-3">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          {canEdit && <ImportDialog projectId={projectFilter} onDone={load} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {STATUS_ORDER.map((s) => (
          <div key={s} className={`inline-flex items-center gap-2 border rounded-sm px-3 py-1.5 ${STATUS_COLORS[s]}`}>
            <div className="h-2 w-2 rounded-full bg-current opacity-70" />
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold">{s}</span>
            <span className="text-sm font-display font-bold tabular-nums">{counts[s]}</span>
          </div>
        ))}
      </div>

      <div className="space-y-8">
        {Object.entries(byTower).map(([tower, floors]) => {
          const floorNums = Object.keys(floors).map(Number).sort((a, b) => b - a);
          return (
            <div key={tower} className="border border-[#E6E4DD] bg-white rounded-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-xl text-forest tracking-tight">Tower {tower}</h3>
                <div className="text-xs text-forest/50">{Object.values(floors).flat().length} units · click a cell to edit</div>
              </div>
              <div className="space-y-2">
                {floorNums.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-14 shrink-0 text-[10px] uppercase tracking-[0.18em] font-bold text-forest/60">Fl {f}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {floors[f].map((u) => (
                        <UnitEditor key={u.id} unit={u} onSaved={load} canEdit={canEdit} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {Object.keys(byTower).length === 0 && (
          <div className="border border-dashed border-[#E6E4DD] rounded-sm p-12 text-center text-forest/50 text-sm">
            No units for this project yet. {canEdit && "Use Import CSV to bulk-load."}
          </div>
        )}
      </div>
    </div>
  );
}
