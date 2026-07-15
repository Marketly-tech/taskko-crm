import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, formatApiError, STAGE_META, STAGE_LABEL, SOURCE_LABEL, inr, relTime } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { LEADS } from "@/constants/testIds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Phone, Mail, MessageSquare, CalendarPlus, BellPlus, PhoneCall, Send, PhoneMissed, Download, PhoneOutgoing, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import StarRating from "@/components/StarRating";

const KIND_ICON = {
  outgoing_call: PhoneCall, incoming_call: Phone, missed_call: PhoneMissed, call: PhoneCall,
  email_sent: Mail, email: Mail, sms_sent: MessageSquare, whatsapp: MessageSquare,
  note: MessageSquare, stage_change: BellPlus, assignment: BellPlus,
  site_visit_scheduled: CalendarPlus, followup_scheduled: BellPlus,
  lead_created: Send, proposal_created: Send,
};

function LogCallDialog({ leadId, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ direction: "outgoing", duration_sec: 60, disposition: "connected", recording_url: "", notes: "" });
  const submit = async () => {
    try {
      const body = { ...form, duration_sec: Number(form.duration_sec) };
      if (!body.recording_url) delete body.recording_url;
      if (!body.notes) delete body.notes;
      await api.post(`/leads/${leadId}/log-call`, body);
      toast.success("Call logged");
      setOpen(false); setForm({ direction: "outgoing", duration_sec: 60, disposition: "connected", recording_url: "", notes: "" });
      onSaved?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button data-testid={LEADS.logCallBtn} className="h-10 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center justify-center gap-2 flex-1">
          <PhoneCall className="h-4 w-4" /> Log call
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-md">
        <DialogHeader><DialogTitle className="font-display text-2xl">Log a call</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label-caps mb-1.5">Direction</div>
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outgoing">Outgoing</SelectItem>
                  <SelectItem value="incoming">Incoming</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="label-caps mb-1.5">Disposition</div>
              <Select value={form.disposition} onValueChange={(v) => setForm({ ...form, disposition: v })}>
                <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="no_answer">No answer</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <div className="label-caps mb-1.5">Duration (seconds)</div>
            <input type="number" value={form.duration_sec} onChange={(e) => setForm({ ...form, duration_sec: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
          </div>
          <div>
            <div className="label-caps mb-1.5">Recording URL (mp3/wav)</div>
            <input value={form.recording_url} onChange={(e) => setForm({ ...form, recording_url: e.target.value })} placeholder="https://cdn.exotel.in/…mp3" className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
            <div className="text-[11px] text-forest/50 mt-1">Auto-populated by Exotel / MyOperator / Twilio webhooks in production.</div>
          </div>
          <div>
            <div className="label-caps mb-1.5">Notes</div>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
          </div>
        </div>
        <DialogFooter>
          <button data-testid={LEADS.submitCallBtn} onClick={submit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Log call</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogSmsDialog({ leadId, onSaved, templates }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tid, setTid] = useState("");
  useEffect(() => {
    if (tid) { const t = templates.find((x) => x.id === tid); if (t) setText(t.body); }
  }, [tid, templates]);
  const submit = async () => {
    if (!text.trim()) return;
    try { await api.post(`/leads/${leadId}/log-sms`, { text, template_id: tid || null }); toast.success("SMS logged"); setOpen(false); setText(""); onSaved?.(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button data-testid={LEADS.logSmsBtn} className="h-10 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center justify-center gap-2 flex-1">
          <MessageSquare className="h-4 w-4" /> Log SMS
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-md">
        <DialogHeader><DialogTitle className="font-display text-2xl">Log an SMS</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {templates.length > 0 && (
            <div>
              <div className="label-caps mb-1.5">Template (optional)</div>
              <Select value={tid || "__none__"} onValueChange={(v) => setTid(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Pick a template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No template —</SelectItem>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <div className="label-caps mb-1.5">Message</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
          </div>
        </div>
        <DialogFooter>
          <button data-testid={LEADS.submitSmsBtn} onClick={submit} disabled={!text.trim()} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">Log SMS</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogEmailDialog({ leadId, onSaved }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const submit = async () => {
    if (!subject.trim() || !body.trim()) return;
    try { await api.post(`/leads/${leadId}/log-email`, { subject, body }); toast.success("Email logged"); setOpen(false); setSubject(""); setBody(""); onSaved?.(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button data-testid={LEADS.logEmailBtn} className="h-10 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center justify-center gap-2 flex-1">
          <Mail className="h-4 w-4" /> Log email
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-md">
        <DialogHeader><DialogTitle className="font-display text-2xl">Log an email</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="label-caps mb-1.5">Subject</div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
          </div>
          <div>
            <div className="label-caps mb-1.5">Body</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
          </div>
        </div>
        <DialogFooter>
          <button data-testid={LEADS.submitEmailBtn} onClick={submit} disabled={!subject.trim() || !body.trim()} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">Log email</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLeadDialog({ lead, projects, onSaved }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  useEffect(() => {
    if (open) setForm({
      name: lead.name || "", phone: lead.phone || "", email: lead.email || "",
      configuration: lead.configuration || "", budget_min: lead.budget_min ?? "",
      budget_max: lead.budget_max ?? "", location_pref: lead.location_pref || "",
      project_id: lead.project_id || "", priority: lead.priority || "warm",
      notes: lead.notes || "",
    });
  }, [open, lead]);
  const submit = async () => {
    try {
      const body = { ...form };
      ["email", "phone", "configuration", "location_pref", "notes"].forEach((k) => { if (body[k] === "") delete body[k]; });
      if (body.budget_min === "" || body.budget_min == null) delete body.budget_min; else body.budget_min = Number(body.budget_min);
      if (body.budget_max === "" || body.budget_max == null) delete body.budget_max; else body.budget_max = Number(body.budget_max);
      if (!body.project_id) delete body.project_id;
      await api.patch(`/leads/${lead.id}`, body);
      toast.success("Lead updated");
      setOpen(false);
      onSaved?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button data-testid="lead-edit-btn" className="text-forest/60 hover:text-forest inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-bold transition-colors duration-150">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-2xl">Edit lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testId="lead-edit-name" />
            <F label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} testId="lead-edit-phone" />
          </div>
          <F label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} testId="lead-edit-email" />
          <div className="grid grid-cols-2 gap-3">
            <F label="Configuration" value={form.configuration} onChange={(v) => setForm({ ...form, configuration: v })} />
            <F label="Location" value={form.location_pref} onChange={(v) => setForm({ ...form, location_pref: v })} />
            <F label="Budget min (₹)" type="number" value={form.budget_min} onChange={(v) => setForm({ ...form, budget_min: v })} />
            <F label="Budget max (₹)" type="number" value={form.budget_max} onChange={(v) => setForm({ ...form, budget_max: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <div className="label-caps mb-1.5">Priority</div>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hot">Hot</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="cold">Cold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <button data-testid="lead-edit-submit" onClick={submit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Save</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, value, onChange, type = "text", testId }) {
  return (
    <div>
      <div className="label-caps mb-1.5">{label}</div>
      <input data-testid={testId} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
    </div>
  );
}

export default function LeadDetail() {
  const { leadId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState("note");
  const [visitAt, setVisitAt] = useState("");
  const [visitProjectId, setVisitProjectId] = useState("");
  const [fuAt, setFuAt] = useState("");
  const [fuKind, setFuKind] = useState("call");
  const [fuOpen, setFuOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

  const load = async () => {
    const [l, u, p, a, t] = await Promise.all([
      api.get(`/leads/${leadId}`),
      api.get("/users"),
      api.get("/projects"),
      api.get("/activities", { params: { lead_id: leadId, limit: 100 } }),
      api.get("/whatsapp-templates"),
    ]);
    setLead(l.data); setUsers(u.data); setProjects(p.data); setActivities(a.data); setTemplates(t.data);
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
    toast.success("Reassigned"); load();
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await api.post(`/leads/${leadId}/notes`, { text: note.trim(), kind: noteKind });
    setNote(""); load();
  };
  const setStars = async (n) => {
    await api.patch(`/leads/${leadId}`, { stars: n });
    load();
  };
  const scheduleVisit = async () => {
    if (!visitAt || !visitProjectId) { toast.error("Pick date & project"); return; }
    try {
      await api.post("/site-visits", { lead_id: leadId, project_id: visitProjectId, scheduled_at: new Date(visitAt).toISOString() });
      toast.success("Site visit scheduled"); setVisitOpen(false); setVisitAt(""); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const createFollowup = async () => {
    if (!fuAt) { toast.error("Pick a due date"); return; }
    try {
      await api.post("/follow-ups", { lead_id: leadId, due_at: new Date(fuAt).toISOString(), kind: fuKind });
      toast.success("Follow-up scheduled"); setFuOpen(false); setFuAt(""); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const stage = STAGE_META.find((s) => s.key === lead.stage);

  const deleteLead = async () => {
    if (!window.confirm("Delete this lead permanently? This also removes all activity.")) return;
    try {
      await api.delete(`/leads/${leadId}`);
      toast.success("Lead deleted");
      nav("/leads");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => nav("/leads")} className="text-xs uppercase tracking-[0.2em] text-forest/60 hover:text-forest inline-flex items-center gap-1.5 transition-colors duration-150">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to leads
        </button>
        <div className="flex items-center gap-4">
          <EditLeadDialog lead={lead} projects={projects} onSaved={load} />
          {user?.role === "admin" && (
            <button data-testid="lead-delete-btn" onClick={deleteLead} className="text-clay/80 hover:text-clay inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] font-bold transition-colors duration-150">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="label-caps">Lead profile</div>
                <div className="flex items-center gap-4 mt-1">
                  <h1 className="font-display font-black text-4xl text-forest tracking-tight">{lead.name}</h1>
                  <StarRating value={lead.stars || 0} onChange={setStars} size={20} testIdBase="lead-star" />
                </div>
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

          {/* Twilio Call button (live) + manual log actions */}
          <div className="grid grid-cols-4 gap-3">
            <button
              data-testid="lead-twilio-call-btn"
              onClick={async () => {
                try {
                  const { data } = await api.post(`/leads/${leadId}/call`);
                  if (data.mock) toast.info("Twilio not configured — mock call logged");
                  else toast.success(`Ringing your phone… (${data.status})`);
                  load();
                } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
              }}
              className="h-10 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 inline-flex items-center justify-center gap-2 col-span-1"
            >
              <PhoneOutgoing className="h-4 w-4" /> Call
            </button>
            <LogCallDialog leadId={leadId} onSaved={load} />
            <LogSmsDialog leadId={leadId} onSaved={load} templates={templates} />
            <LogEmailDialog leadId={leadId} onSaved={load} />
          </div>

          {/* Timeline */}
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
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                data-testid={LEADS.addNoteInput}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Quick note…"
                className="flex-1 h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest"
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
              />
              <button data-testid={LEADS.addNoteSubmit} onClick={addNote} className="h-10 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Log</button>
            </div>
            <div className="mt-5 space-y-4 max-h-[520px] overflow-y-auto pr-1">
              {activities.length === 0 && <div className="text-sm text-forest/50 py-6 text-center">No activity yet.</div>}
              {activities.map((a) => {
                const Icon = KIND_ICON[a.kind] || Send;
                const rec = a.meta?.recording_url;
                return (
                  <div key={a.id} className="flex gap-3">
                    <div className="mt-1 h-7 w-7 rounded-sm border border-[#E6E4DD] grid place-items-center text-forest shrink-0">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-forest">
                        <span className="font-medium">{a.actor_name || "System"}</span>
                        <span className="text-forest/50"> · {a.kind.replace(/_/g, " ")}</span>
                      </div>
                      <div className="text-sm text-forest/80 mt-0.5">{a.message}</div>
                      {rec && (
                        <div className="mt-2 flex items-center gap-2">
                          <audio controls src={rec} className="h-8" style={{ width: 260 }} />
                          <a href={rec} download className="text-xs uppercase tracking-[0.15em] font-bold text-forest hover:text-clay transition-colors duration-150 inline-flex items-center gap-1">
                            <Download className="h-3 w-3" /> Download
                          </a>
                        </div>
                      )}
                      <div className="text-[11px] text-forest/40 mt-1">{relTime(a.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
            <div className="label-caps mb-3">Move stage</div>
            <div className="grid grid-cols-2 gap-2">
              {STAGE_META.map((s) => (
                <button
                  key={s.key}
                  data-testid={LEADS.stageBtn}
                  data-stage={s.key}
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
            <div className="label-caps">Schedule</div>
            <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
              <DialogTrigger asChild>
                <button className="w-full h-10 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center justify-center gap-2">
                  <CalendarPlus className="h-4 w-4" /> Site visit
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
                  <button onClick={scheduleVisit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Schedule visit</button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={fuOpen} onOpenChange={setFuOpen}>
              <DialogTrigger asChild>
                <button className="w-full h-10 rounded-sm border border-[#E6E4DD] text-sm text-forest hover:border-forest transition-colors duration-150 inline-flex items-center justify-center gap-2">
                  <BellPlus className="h-4 w-4" /> Follow-up
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
