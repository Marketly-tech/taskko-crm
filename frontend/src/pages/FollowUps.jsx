import React, { useEffect, useState } from "react";
import { api, relTime, STAGE_META, STAGE_LABEL } from "@/lib/api";
import { useProjects } from "@/contexts/ProjectContext";
import { Link } from "react-router-dom";
import { FOLLOWUP } from "@/constants/testIds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Phone, MessageSquare, Mail, Calendar as CalIcon } from "lucide-react";
import { toast } from "sonner";

const KIND_ICON = { call: Phone, whatsapp: MessageSquare, email: Mail, meeting: CalIcon };

const dayStart = (offset = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const DATE_PRESETS = [
  { key: "", label: "All dates", range: () => [null, null] },
  { key: "overdue", label: "Overdue", range: () => [null, new Date()] },
  { key: "today", label: "Today", range: () => [dayStart(0), dayStart(1)] },
  { key: "tomorrow", label: "Tomorrow", range: () => [dayStart(1), dayStart(2)] },
  { key: "week", label: "This week", range: () => { const s = dayStart(-((new Date().getDay() + 6) % 7)); const e = new Date(s); e.setDate(e.getDate() + 7); return [s, e]; } },
  { key: "custom", label: "Custom" },
];
const dateCls = "h-8 border border-[#E6E4DD] rounded-sm px-2 text-xs text-forest bg-white focus:outline-none focus:border-forest";

function FollowUpFilters({ preset, setPreset, custom, setCustom, stage, setStage, status, setStatus }) {
  return (
    <div data-testid="followups-filters" className="flex flex-wrap items-center gap-2 border border-[#E6E4DD] bg-white rounded-sm px-3 py-2">
      <div className="flex gap-1 flex-wrap">
        {DATE_PRESETS.map((p) => (
          <button key={p.key || "all"} data-testid={`followups-date-${p.key || "all"}`} onClick={() => setPreset(p.key)}
            className={`h-8 px-3 rounded-sm text-xs font-medium border transition-colors duration-150 ${preset === p.key ? "bg-forest text-white border-forest" : "bg-white text-forest border-[#E6E4DD] hover:border-forest"}`}>{p.label}</button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input data-testid="followups-date-from" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={dateCls} />
          <span className="text-xs text-forest/50">to</span>
          <input data-testid="followups-date-to" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={dateCls} />
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <Select value={stage || "__all__"} onValueChange={(v) => setStage(v === "__all__" ? "" : v)}>
          <SelectTrigger data-testid="followups-filter-stage" className="w-[170px] h-8 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All stages</SelectItem>
            {STAGE_META.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status || "__all__"} onValueChange={(v) => setStatus(v === "__all__" ? "" : v)}>
          <SelectTrigger data-testid="followups-filter-status" className="w-[140px] h-8 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="missed">Missed</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function FollowUps() {
  const [items, setItems] = useState([]);
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("pending");
  const [preset, setPreset] = useState("");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [stage, setStage] = useState("");
  const { projectParam } = useProjects();

  const load = async () => {
    const params = {};
    if (status) params.status = status;
    if (stage) params.stage = stage;
    if (projectParam) params.project_id = projectParam;
    const [from, to] = preset === "custom"
      ? [custom.from ? new Date(`${custom.from}T00:00:00`) : null, custom.to ? new Date(new Date(`${custom.to}T00:00:00`).getTime() + 86400000) : null]
      : (DATE_PRESETS.find((p) => p.key === preset)?.range() || [null, null]);
    if (from) params.date_from = from.toISOString();
    if (to) params.date_to = to.toISOString();
    const [fu, l] = await Promise.all([
      api.get("/follow-ups", { params }),
      api.get("/leads", { params: projectParam ? { project_id: projectParam } : {} }),
    ]);
    setItems(fu.data);
    setLeads(l.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, stage, preset, custom.from, custom.to, projectParam]);

  const complete = async (id) => {
    await api.patch(`/follow-ups/${id}`, { status: "done" });
    toast.success("Follow-up completed");
    load();
  };

  const now = Date.now();
  const overdue = items.filter((i) => new Date(i.due_at).getTime() < now && i.status === "pending");
  const upcoming = items.filter((i) => !overdue.includes(i));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label-caps">Follow-ups</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">
            {overdue.length} overdue · {upcoming.length} upcoming
          </h2>
        </div>
      </div>

      <FollowUpFilters preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} stage={stage} setStage={setStage} status={status} setStatus={setStatus} />

      {overdue.length > 0 && (
        <Section title="Overdue" tone="clay" items={overdue} leads={leads} onComplete={complete} />
      )}
      {upcoming.length > 0 && <Section title="Upcoming" tone="forest" items={upcoming} leads={leads} onComplete={complete} />}
      {items.length === 0 && (
        <div data-testid="followups-empty" className="border border-dashed border-[#E6E4DD] rounded-sm p-12 text-center text-forest/50 text-sm">
          {preset || stage || projectParam || status !== "pending" ? "No follow-ups match these filters." : "You're all caught up."}
        </div>
      )}
    </div>
  );
}

function Section({ title, tone, items, leads, onComplete }) {
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm">
      <div className="px-5 py-3 border-b border-[#E6E4DD] flex items-center gap-2 bg-bone-alt/40">
        <div className={`h-2 w-2 rounded-full ${tone === "clay" ? "bg-clay" : "bg-forest"}`} />
        <div className="font-display font-bold text-lg text-forest tracking-tight">{title}</div>
        <div className="text-xs text-forest/50 ml-2">{items.length}</div>
      </div>
      <div className="divide-y divide-[#E6E4DD]">
        {items.map((i) => {
          const lead = leads.find((l) => l.id === i.lead_id);
          const Icon = KIND_ICON[i.kind] || Phone;
          const overdue = new Date(i.due_at).getTime() < Date.now() && i.status === "pending";
          return (
            <div key={i.id} data-testid={FOLLOWUP.row(i.id)} className="px-5 py-4 flex items-center gap-4">
              <div className="h-9 w-9 rounded-sm border border-[#E6E4DD] grid place-items-center text-forest">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                {lead ? (
                  <Link to={`/leads/${lead.id}`} className="font-medium text-forest hover:text-clay transition-colors duration-150">
                    {lead.name}
                  </Link>
                ) : <span className="text-forest/50">Lead removed</span>}
                <div className="text-xs text-forest/60 mt-0.5">
                  <span className="uppercase tracking-[0.15em] font-bold text-[10px] mr-2">{i.kind}</span>
                  {lead?.stage && <span data-testid={`followup-stage-${i.id}`} className="text-[10px] uppercase tracking-[0.12em] font-bold text-forest bg-bone-alt border border-[#E6E4DD] rounded-sm px-1.5 py-0.5 mr-2">{STAGE_LABEL[lead.stage] || lead.stage}</span>}
                  {new Date(i.due_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  <span className={`ml-2 ${overdue ? "text-clay font-medium" : "text-forest/40"}`}>· {relTime(i.due_at)}</span>
                </div>
              </div>
              {i.status === "pending" && (
                <button data-testid={FOLLOWUP.completeBtn(i.id)} onClick={() => onComplete(i.id)} className="text-xs h-8 px-3 rounded-sm border border-[#E6E4DD] text-forest hover:border-forest transition-colors duration-150 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                </button>
              )}
              {i.status === "done" && (
                <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#2D6A4F]">Done</span>
              )}
            </div>
          );
        })}
        {items.length === 0 && <div className="px-5 py-6 text-sm text-forest/50">Nothing here.</div>}
      </div>
    </div>
  );
}
