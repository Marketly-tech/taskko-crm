import React, { useEffect, useMemo, useState } from "react";
import { api, inr } from "@/lib/api";
import { useProjects } from "@/contexts/ProjectContext";
import { INVENTORY } from "@/constants/testIds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const STATUS_COLORS = {
  available: "bg-[#2D6A4F]/10 text-[#2D6A4F] border-[#2D6A4F]/30",
  held: "bg-[#D4A373]/20 text-[#8A5A2B] border-[#D4A373]/40",
  booked: "bg-[#C25934]/10 text-[#C25934] border-[#C25934]/30",
  sold: "bg-forest/10 text-forest border-forest/30",
};

const STATUS_ORDER = ["available", "held", "booked", "sold"];

export default function Inventory() {
  const { projects, activeId, setActive } = useProjects();
  const [units, setUnits] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState(activeId && activeId !== "__all__" ? activeId : (projects[0]?.id || ""));

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
    // sort floors desc so top floors are on top of the visual stack
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

  const cycleStatus = async (unit) => {
    const idx = STATUS_ORDER.indexOf(unit.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    try {
      await api.patch(`/units/${unit.id}`, { status: next });
      toast.success(`${unit.unit_no} → ${next}`);
      load();
    } catch (e) {
      toast.error("Update failed (needs admin/manager)");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label-caps">Inventory</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Unit matrix</h2>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* status legend */}
      <div className="flex flex-wrap gap-3">
        {STATUS_ORDER.map((s) => (
          <div key={s} className={`inline-flex items-center gap-2 border rounded-sm px-3 py-1.5 ${STATUS_COLORS[s]}`}>
            <div className="h-2 w-2 rounded-full bg-current opacity-70" />
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold">{s}</span>
            <span className="text-sm font-display font-bold tabular-nums">{counts[s]}</span>
          </div>
        ))}
      </div>

      {/* towers */}
      <div className="space-y-8">
        {Object.entries(byTower).map(([tower, floors]) => {
          const floorNums = Object.keys(floors).map(Number).sort((a, b) => b - a);
          return (
            <div key={tower} className="border border-[#E6E4DD] bg-white rounded-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-xl text-forest tracking-tight">Tower {tower}</h3>
                <div className="text-xs text-forest/50">{Object.values(floors).flat().length} units</div>
              </div>
              <div className="space-y-2">
                {floorNums.map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-14 shrink-0 text-[10px] uppercase tracking-[0.18em] font-bold text-forest/60">Fl {f}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {floors[f].map((u) => (
                        <button
                          key={u.id}
                          data-testid={INVENTORY.unitCell(u.id)}
                          onClick={() => cycleStatus(u)}
                          className={`border rounded-sm px-3 h-11 min-w-[86px] text-left transition-colors duration-150 hover:border-forest ${STATUS_COLORS[u.status] || ""}`}
                          title={`${u.unit_no} · ${u.config} · ${inr(u.price)} · click to cycle status`}
                        >
                          <div className="text-[10px] uppercase tracking-[0.15em] font-bold leading-none">{u.unit_no}</div>
                          <div className="text-[10px] mt-1 opacity-75">{u.config}</div>
                        </button>
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
            No units for this project yet.
          </div>
        )}
      </div>
    </div>
  );
}
