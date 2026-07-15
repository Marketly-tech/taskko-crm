import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError, SOURCE_LABEL, STAGE_META, relTime } from "@/lib/api";
import { CONSOLE, LEADS } from "@/constants/testIds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Shuffle, Users2 } from "lucide-react";
import { toast } from "sonner";

export default function BulkAllocation() {
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [assignee, setAssignee] = useState("");
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const [ownedBy, setOwnedBy] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [l, u] = await Promise.all([api.get("/leads"), api.get("/users")]);
    setLeads(l.data); setUsers(u.data);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (stage && l.stage !== stage) return false;
      if (source && l.source !== source) return false;
      if (ownedBy === "__unassigned__" && l.assigned_to) return false;
      if (ownedBy && ownedBy !== "__unassigned__" && l.assigned_to !== ownedBy) return false;
      return true;
    });
  }, [leads, stage, source, ownedBy]);

  const toggleAll = (checked) => {
    if (checked) setSelected(new Set(filtered.map((l) => l.id)));
    else setSelected(new Set());
  };
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const assign = async () => {
    if (!assignee) { toast.error("Pick an executive"); return; }
    if (selected.size === 0) { toast.error("Select at least one lead"); return; }
    setBusy(true);
    try {
      const r = await api.post("/leads/bulk-assign", { lead_ids: [...selected], user_id: assignee });
      toast.success(`Assigned ${r.data.modified} leads`);
      setSelected(new Set());
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label-caps">Console</div>
        <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Bulk lead allocation</h2>
        <div className="text-sm text-forest/60 mt-1">Filter leads, pick many, assign to one executive in one shot.</div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 border border-[#E6E4DD] bg-white rounded-sm p-4">
        <Select value={stage || "__all__"} onValueChange={(v) => setStage(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-9 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All stages</SelectItem>
            {STAGE_META.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source || "__all__"} onValueChange={(v) => setSource(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-9 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sources</SelectItem>
            {Object.keys(SOURCE_LABEL).map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ownedBy || "__all__"} onValueChange={(v) => setOwnedBy(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-9 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Owned by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any owner</SelectItem>
            <SelectItem value="__unassigned__">Unassigned</SelectItem>
            {users.filter((u) => u.role === "executive").map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-forest/60 self-center tabular-nums">
          {filtered.length} matches · {selected.size} selected
        </div>
      </div>

      <div className="flex items-center gap-3 border border-clay/30 bg-clay/5 rounded-sm p-4">
        <Shuffle className="h-4 w-4 text-clay" />
        <div className="text-sm text-forest flex-1">Assign the {selected.size} selected lead{selected.size === 1 ? "" : "s"} to:</div>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger data-testid={CONSOLE.bulkExec} className="w-56 h-9 rounded-sm border-[#E6E4DD] bg-white"><SelectValue placeholder="Pick executive" /></SelectTrigger>
          <SelectContent>
            {users.filter((u) => u.role === "executive").map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <button data-testid={CONSOLE.bulkAssignBtn} onClick={assign} disabled={busy || selected.size === 0 || !assignee} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">
          {busy ? "Assigning…" : "Assign selected"}
        </button>
      </div>

      <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bone-alt/60 border-b border-[#E6E4DD]">
            <tr className="text-[10px] uppercase tracking-[0.15em] text-forest/70">
              <th className="px-4 py-3 w-10 text-left">
                <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
              </th>
              <th className="text-left px-4 py-3 font-bold">Lead</th>
              <th className="text-left px-4 py-3 font-bold">Source</th>
              <th className="text-left px-4 py-3 font-bold">Stage</th>
              <th className="text-left px-4 py-3 font-bold">Current owner</th>
              <th className="text-left px-4 py-3 font-bold">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6E4DD]">
            {filtered.map((l) => {
              const owner = users.find((u) => u.id === l.assigned_to);
              return (
                <tr key={l.id} className="hover:bg-bone-alt/30 transition-colors duration-100">
                  <td className="px-4 py-3">
                    <Checkbox data-testid={LEADS.rowCheckbox(l.id)} checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium text-forest">{l.name}</td>
                  <td className="px-4 py-3 text-forest/60 text-xs">{SOURCE_LABEL[l.source] || l.source}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const s = STAGE_META.find((x) => x.key === l.stage);
                      return <span className="text-[10px] uppercase tracking-[0.15em] font-bold rounded-sm px-2 py-0.5" style={{ background: `${s?.tone}14`, color: s?.tone }}>{s?.label}</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-forest/70 text-xs">{owner?.name || <span className="text-clay font-medium">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-forest/50 text-xs">{relTime(l.created_at)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-forest/50 text-sm">No leads match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
