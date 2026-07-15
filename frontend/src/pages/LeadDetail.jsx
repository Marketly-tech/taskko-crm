import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, formatApiError, STAGE_META, STAGE_LABEL, SOURCE_LABEL, inr, relTime } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { LEADS } from "@/constants/testIds";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Mail, MessageSquare, CalendarPlus, BellPlus, Building2, Target, User2 } from "lucide-react";
import { toast } from "sonner";

export default function LeadDetail() {
  const { leadId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [scheduling, setScheduling] = useState(false);
  const [visitAt, setVisitAt] = useState("");
  const [visitProjectId, setVisitProjectId] = useState("");
  const [fuAt, setFuAt] = useState("");
  const [fuKind, setFuKind] = useState("call");
  const [fuOpen, setFuOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

  const load = async () => {
    const [l, u, p, a] = await Promise.all([
      api.get(`/leads/${leadId}`),
      api.get("/users"),
      api.get("/projects"),
      api.get("/activities", { params: { lead_id: leadId, limit: 50 } }),
    ]);
    setLead(l.data);
    setUsers(u.data);
    setProjects(p.data);
    setActivities(a.data);
    setVisitProjectId(l.data.project_id || "");
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  if (!lead) return <div className="text-forest/50 text-sm">Loading lead…</div>;

  const owner = users.find((u) => u.id === lead.assigned_to);
  const project = projects.find((p) => p.id === lead.project_id);
  const canReassign = user?.role === "admin" || user?.role === "manager";

  const changeStage = async (newStage) => {
    await api.post(`/leads/${leadId}/stage`, { stage: newStage });
    toast.success(`Stage → ${STAGE_LABEL[newStage]}`);
    load();
  };

  const reassign = async (userId) => {
    await api.post(`/leads/${leadId}/assign`, { user_id: userId });
    toast.success("Reassigned");
    load();
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await api.post(`/leads/${leadId}/notes`, { text: note.trim(), kind: noteKind });
    setNote("");
    load();
  };

  const scheduleVisit = async () => {
    if (!visitAt || !visitProjectId) { toast.error("Pick date & project"); return; }
    setScheduling(true);
    try {
      await api.post("/site-visits", {
        lead_id: leadId, project_id: visitProjectId, scheduled_at: new Date(visitAt).toISOString(),
      });
      toast.success("Site visit scheduled");
      setVisitOpen(false); setVisitAt("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setScheduling(false);
    }
  };

  const createFollowup = async () => {
    if (!fuAt) { toast.error("Pick a due date"); return; }
    try {
      await api.post("/follow-ups", { lead_id: leadId, due_at: new Date(fuAt).toISOString(), kind: fuKind });
      toast.success("Follow-up scheduled");
      setFuOpen(false); setFuAt("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const stage = STAGE_META.find((s) => s.key === lead.stage);

  return (
    <div className="space-y-6">
      <button onClick={() => nav("/leads")} className="text-xs uppercase tracking-[0.2em] text-forest/60 hover:text-forest inline-flex items-center gap-1.5 transition-colors duration-150">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to leads
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: profile */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="label-caps">Lead profile</div>
                <h1 className="font-display font-black text-4xl text-forest tracking-tight mt-1">{lead.name}</h1>
                <div className="flex items-center gap-4 mt-3 text-sm text-forest/70">
                  {lead.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {lead.phone}</span>}
                  {lead.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {lead.email}</span>}
                </div>
              </div>
              <span
                className="text-[10px] uppercase tracking-[0.18em] font-bold rounded-sm px-2.5 py-1"
                style={{ background: `${stage?.tone}14`, color: stage?.tone }}
              >
                {stage?.label}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[#E6E4DD]">
              <Field label="Source" value={SOURCE_LABEL[lead.source] || lead.source} />
              <Field label="Project" value={project?.name || "—"} />
              <Field label="Configuration" value={lead.configuration || "—"} />
              <Field label="Budget" value={`${inr(lead.budget_min)} – ${inr(lead.budget_max)}`} />
              <Field label="Location" value={lead.location_pref || "—"} />
              <Field label="Priority" value={(lead.priority || "warm").toUpperCase()} />
              <Field label="Created" value={relTime(lead.created_at)} />
              <Field label="Updated" value={relTime(lead.updated_at || lead.created_at)} />
            </div>
          </div>

          {/* Activity timeline */}
          <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="label-caps">Activity</div>
                <h3 className="font-display font-bold text-xl text-forest tracking-tight mt-1">Timeline</h3>
              </div>
              <div className="flex items-center gap-1">
                <Select value={noteKind} onValueChange={setNoteKind}>
                  <SelectTrigger className="h-8 w-32 rounded-sm border-[#E6E4DD] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="call">Call log</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                data-testid={LEADS.addNoteInput}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Log a call, WhatsApp update, or note…"
                className="flex-1 h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest"
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
              />
              <button data-testid={LEADS.addNoteSubmit} onClick={addNote} className="h-10 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Log</button>
            </div>
            <div className="mt-5 space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {activities.length === 0 && <div className="text-sm text-forest/50 py-6 text-center">No activity yet.</div>}
              {activities.map((a) => (
                <div key={a.id} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-forest shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-forest">
                      <span className="font-medium">{a.actor_name || "System"}</span>
                      <span className="text-forest/50"> · {a.kind.replace(/_/g, " ")}</span>
                    </div>
                    <div className="text-sm text-forest/80 mt-0.5">{a.message}</div>
                    <div className="text-[11px] text-forest/40 mt-1">{relTime(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-6">
          <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
            <div className="label-caps mb-3">Move stage</div>
            <div className="grid grid-cols-2 gap-2">
              {STAGE_META.map((s) => (
                <button
                  key={s.key}
                  data-testid={`stage-btn-${s.key}`}
                  onClick={() => changeStage(s.key)}
                  className={`text-xs font-medium h-9 rounded-sm border transition-colors duration-150 ${s.key === lead.stage ? "border-forest bg-forest text-white" : "border-[#E6E4DD] text-forest hover:border-forest"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
            <div className="label-caps mb-3">Owner</div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-sm bg-forest text-white grid place-items-center font-display font-bold">{(owner?.name || "?").slice(0, 1)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-forest truncate">{owner?.name || "Unassigned"}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-forest/50">{owner?.role || ""}</div>
              </div>
            </div>
            {canReassign && (
              <Select value={lead.assigned_to || "__none__"} onValueChange={(v) => v !== "__none__" && reassign(v)}>
                <SelectTrigger data-testid={LEADS.assignBtn} className="h-9 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Reassign…" /></SelectTrigger>
                <SelectContent>
                  {users.filter((u) => u.role === "executive").map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="border border-[#E6E4DD] bg-white rounded-sm p-6 space-y-3">
            <div className="label-caps">Quick actions</div>

            <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
              <DialogTrigger asChild>
                <button className="w-full h-10 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center justify-center gap-2">
                  <CalendarPlus className="h-4 w-4" /> Schedule site visit
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader><DialogTitle className="font-display text-2xl">Schedule site visit</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <div className="label-caps mb-1.5">Project</div>
                    <Select value={visitProjectId} onValueChange={setVisitProjectId}>
                      <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Pick project" /></SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="label-caps mb-1.5">Date & time</div>
                    <input type="datetime-local" value={visitAt} onChange={(e) => setVisitAt(e.target.value)} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                  </div>
                </div>
                <DialogFooter>
                  <button disabled={scheduling} onClick={scheduleVisit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">
                    {scheduling ? "Scheduling…" : "Schedule visit"}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={fuOpen} onOpenChange={setFuOpen}>
              <DialogTrigger asChild>
                <button className="w-full h-10 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center justify-center gap-2">
                  <BellPlus className="h-4 w-4" /> Set follow-up
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader><DialogTitle className="font-display text-2xl">Set follow-up</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <div className="label-caps mb-1.5">Type</div>
                    <Select value={fuKind} onValueChange={setFuKind}>
                      <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="label-caps mb-1.5">Due at</div>
                    <input type="datetime-local" value={fuAt} onChange={(e) => setFuAt(e.target.value)} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                  </div>
                </div>
                <DialogFooter>
                  <button onClick={createFollowup} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Save follow-up</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {lead.phone && (
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="w-full h-10 rounded-sm bg-[#25D366]/10 text-[#128C7E] text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#25D366]/20 transition-colors duration-150">
                <MessageSquare className="h-4 w-4" /> WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="label-caps mb-1">{label}</div>
      <div className="text-sm text-forest font-medium truncate">{value}</div>
    </div>
  );
}
