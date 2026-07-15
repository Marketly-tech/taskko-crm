import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiError, STAGE_META, SOURCE_LABEL, inr, relTime } from "@/lib/api";
import { useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { LEADS } from "@/constants/testIds";
import { Link, useSearchParams } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, LayoutGrid, List, Filter, Phone, MessageSquare, Mail, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const SOURCES = Object.keys(SOURCE_LABEL);

function StageBadge({ stage }) {
  const s = STAGE_META.find((x) => x.key === stage);
  return (
    <span
      className="text-[10px] uppercase tracking-[0.15em] font-bold rounded-sm px-2 py-0.5"
      style={{ background: `${s?.tone}14`, color: s?.tone }}
    >
      {s?.label || stage}
    </span>
  );
}

function LeadCreateDialog({ onCreated, users, projects, activeProjectId }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", email: "", source: "manual", project_id: activeProjectId || "",
    budget_min: "", configuration: "", notes: "", assigned_to: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const body = { ...form };
      ["project_id", "assigned_to", "email", "budget_min", "configuration", "notes"].forEach((k) => {
        if (body[k] === "" || body[k] == null) delete body[k];
      });
      if (body.budget_min) body.budget_min = Number(body.budget_min);
      const { data } = await api.post("/leads", body);
      toast.success(`Lead ${data.name} created`);
      setOpen(false);
      onCreated?.(data);
      setForm({ ...form, name: "", phone: "", email: "", notes: "" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          data-testid={LEADS.newLeadBtn}
          className="h-9 rounded-sm bg-forest text-white text-sm px-3.5 font-medium hover:bg-forest-soft transition-colors duration-150 inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> New lead
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label-caps mb-1.5">Name</div>
              <input data-testid={LEADS.createName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
            </div>
            <div>
              <div className="label-caps mb-1.5">Phone</div>
              <input data-testid={LEADS.createPhone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
            </div>
          </div>
          <div>
            <div className="label-caps mb-1.5">Email</div>
            <input data-testid={LEADS.createEmail} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label-caps mb-1.5">Source</div>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger data-testid={LEADS.createSource} className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="label-caps mb-1.5">Project</div>
              <Select value={form.project_id || "__none__"} onValueChange={(v) => setForm({ ...form, project_id: v === "__none__" ? "" : v })}>
                <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label-caps mb-1.5">Budget min (₹)</div>
              <input data-testid={LEADS.createBudget} type="number" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
            </div>
            <div>
              <div className="label-caps mb-1.5">Config</div>
              <input value={form.configuration} onChange={(e) => setForm({ ...form, configuration: e.target.value })} placeholder="3BHK" className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
            </div>
          </div>
          <div>
            <div className="label-caps mb-1.5">Assign to</div>
            <Select value={form.assigned_to || "__auto__"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "__auto__" ? "" : v })}>
              <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Auto-assign (least loaded)</SelectItem>
                {users.filter((u) => u.role === "executive").map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancel</Button>
          <button data-testid={LEADS.createSubmit} disabled={busy || !form.name} onClick={submit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">
            {busy ? "Saving…" : "Create lead"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KanbanBoard({ leads, onMove, users }) {
  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGE_META.map((s) => [s.key, []]));
    leads.forEach((l) => { if (m[l.stage]) m[l.stage].push(l); });
    return m;
  }, [leads]);

  const onDragStart = (e, id) => { e.dataTransfer.setData("text/plain", id); };
  const onDrop = async (e, stage) => {
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    await onMove(id, stage);
  };

  return (
    <div className="kanban-scroll overflow-x-auto">
      <div className="flex gap-4 min-w-max pb-2">
        {STAGE_META.map((s) => (
          <div
            key={s.key}
            data-testid={LEADS.kanbanColumn(s.key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, s.key)}
            className="w-[280px] shrink-0 bg-bone-alt/60 border border-[#E6E4DD] rounded-sm p-3"
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ background: s.tone }} />
                <div className="text-xs uppercase tracking-[0.15em] font-bold text-forest">{s.label}</div>
              </div>
              <div className="text-xs text-forest/60 tabular-nums">{byStage[s.key].length}</div>
            </div>
            <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              {byStage[s.key].map((l) => {
                const owner = users.find((u) => u.id === l.assigned_to);
                return (
                  <Link
                    to={`/leads/${l.id}`}
                    key={l.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, l.id)}
                    data-testid={LEADS.kanbanCard(l.id)}
                    className="block bg-white border border-[#E6E4DD] rounded-sm p-3 hover:border-forest transition-colors duration-150 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-forest text-sm truncate">{l.name}</div>
                      {l.priority === "hot" && <span className="text-[9px] uppercase font-bold tracking-wider text-clay">Hot</span>}
                    </div>
                    <div className="text-[11px] text-forest/50 mt-0.5 truncate">{l.phone || l.email}</div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-forest/60">
                        {SOURCE_LABEL[l.source] || l.source}
                      </span>
                      <span className="text-[10px] text-forest/50">{relTime(l.created_at)}</span>
                    </div>
                    {owner && (
                      <div className="mt-2 pt-2 border-t border-[#E6E4DD] flex items-center gap-2">
                        <div className="h-5 w-5 rounded-sm bg-forest text-white grid place-items-center text-[10px] font-bold">{owner.name.slice(0, 1)}</div>
                        <div className="text-[11px] text-forest/60 truncate">{owner.name}</div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadsTable({ leads, users }) {
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bone-alt/60 border-b border-[#E6E4DD]">
          <tr className="text-[10px] uppercase tracking-[0.15em] text-forest/70">
            <th className="text-left px-4 py-3 font-bold">Lead</th>
            <th className="text-left px-4 py-3 font-bold">Contact</th>
            <th className="text-left px-4 py-3 font-bold">Source</th>
            <th className="text-left px-4 py-3 font-bold">Stage</th>
            <th className="text-left px-4 py-3 font-bold">Assignee</th>
            <th className="text-left px-4 py-3 font-bold">Budget</th>
            <th className="text-left px-4 py-3 font-bold">Age</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E6E4DD]">
          {leads.map((l) => {
            const owner = users.find((u) => u.id === l.assigned_to);
            return (
              <tr
                key={l.id}
                data-testid={LEADS.row(l.id)}
                className="hover:bg-bone-alt/30 transition-colors duration-100"
              >
                <td className="px-4 py-3">
                  <Link to={`/leads/${l.id}`} className="font-medium text-forest hover:text-clay transition-colors duration-150">
                    {l.name}
                  </Link>
                  {l.priority === "hot" && <span className="ml-2 text-[9px] uppercase font-bold tracking-wider text-clay">HOT</span>}
                </td>
                <td className="px-4 py-3 text-forest/70">
                  <div className="flex items-center gap-3 text-xs">
                    {l.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {l.phone}</span>}
                    {l.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> <span className="truncate max-w-[140px]">{l.email}</span></span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-forest/70 text-xs">{SOURCE_LABEL[l.source] || l.source}</td>
                <td className="px-4 py-3"><StageBadge stage={l.stage} /></td>
                <td className="px-4 py-3 text-forest/70 text-xs">{owner?.name || "—"}</td>
                <td className="px-4 py-3 text-forest/70 text-xs tabular-nums">{inr(l.budget_min)} – {inr(l.budget_max)}</td>
                <td className="px-4 py-3 text-forest/50 text-xs">{relTime(l.created_at)}</td>
              </tr>
            );
          })}
          {leads.length === 0 && (
            <tr><td colSpan={7} className="py-12 text-center text-forest/50">No leads match your filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Leads() {
  const { user } = useAuth();
  const { activeId } = useProjects();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState("kanban");
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState(params.get("stage") || "");
  const [source, setSource] = useState(params.get("source") || "");
  const [execFilter, setExecFilter] = useState(params.get("assigned_to") || "");
  const [projectFilter, setProjectFilter] = useState(params.get("project_id") || "");
  const [createdFilter, setCreatedFilter] = useState(params.get("created") || "");
  const [loading, setLoading] = useState(false);
  const [editLead, setEditLead] = useState(null);

  // Sync filters → URL
  useEffect(() => {
    const next = new URLSearchParams();
    if (stage) next.set("stage", stage);
    if (source) next.set("source", source);
    if (execFilter) next.set("assigned_to", execFilter);
    if (projectFilter) next.set("project_id", projectFilter);
    if (createdFilter) next.set("created", createdFilter);
    setParams(next, { replace: true });
    // eslint-disable-next-line
  }, [stage, source, execFilter, projectFilter, createdFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (projectFilter) params.project_id = projectFilter;
      if (stage) params.stage = stage;
      if (source) params.source = source;
      if (execFilter) params.assigned_to = execFilter;
      if (q) params.search = q;
      const [leadsR, usersR, projR] = await Promise.all([
        api.get("/leads", { params }),
        api.get("/users"),
        api.get("/projects"),
      ]);
      let filtered = leadsR.data;
      if (createdFilter === "this_month") {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        filtered = filtered.filter((l) => l.created_at >= start);
      }
      setLeads(filtered);
      setUsers(usersR.data);
      setProjects(projR.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [stage, source, q, execFilter, projectFilter, createdFilter]);

  const move = async (leadId, newStage) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l)));
    try {
      await api.post(`/leads/${leadId}/stage`, { stage: newStage });
      toast.success(`Moved to ${STAGE_META.find((s) => s.key === newStage)?.label}`);
    } catch (e) {
      toast.error("Failed to move lead");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps">Sales pipeline</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">
            {leads.length} lead{leads.length === 1 ? "" : "s"} in view
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-[#E6E4DD] rounded-sm bg-white" data-testid={LEADS.toggleView}>
            <button
              onClick={() => setView("kanban")}
              className={`px-3 h-9 text-xs uppercase tracking-[0.15em] font-bold inline-flex items-center gap-1.5 transition-colors duration-150 ${view === "kanban" ? "bg-forest text-white" : "text-forest/70 hover:text-forest"}`}
              data-testid="leads-view-kanban"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 h-9 text-xs uppercase tracking-[0.15em] font-bold inline-flex items-center gap-1.5 transition-colors duration-150 ${view === "list" ? "bg-forest text-white" : "text-forest/70 hover:text-forest"}`}
              data-testid="leads-view-list"
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <LeadCreateDialog users={users} projects={projects} activeProjectId={activeId !== "__all__" ? activeId : ""} onCreated={load} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border border-[#E6E4DD] bg-white rounded-sm px-3 py-2">
        <Filter className="h-4 w-4 text-forest/50" />
        <input
          data-testid={LEADS.searchInput}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, email…"
          className="h-8 px-2 text-sm bg-transparent outline-none flex-1 min-w-[180px]"
        />
        <Select value={stage || "__all__"} onValueChange={(v) => setStage(v === "__all__" ? "" : v)}>
          <SelectTrigger data-testid={LEADS.filterStage} className="w-[140px] h-8 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All stages</SelectItem>
            {STAGE_META.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source || "__all__"} onValueChange={(v) => setSource(v === "__all__" ? "" : v)}>
          <SelectTrigger data-testid={LEADS.filterSource} className="w-[150px] h-8 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sources</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={execFilter || "__all__"} onValueChange={(v) => setExecFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger data-testid={LEADS.filterExec} className="w-[160px] h-8 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Executive" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All executives</SelectItem>
            {users.filter((u) => u.role === "executive").map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={projectFilter || "__all__"} onValueChange={(v) => setProjectFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger data-testid={LEADS.filterProject} className="w-[180px] h-8 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All projects</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-forest/50 text-sm">Loading…</div>
      ) : view === "kanban" ? (
        <KanbanBoard leads={leads} onMove={move} users={users} />
      ) : (
        <LeadsTable leads={leads} users={users} />
      )}
    </div>
  );
}
