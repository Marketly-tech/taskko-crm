import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, formatApiError, relTime, STAGE_LABEL, STAGE_META } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { LayoutDashboard, PhoneCall, ListOrdered, MessageSquareText, ScrollText, Settings2, PhoneOutgoing, PhoneMissed, PhoneOff, Play, Pause, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "dialer", label: "Dialer", icon: PhoneCall },
  { key: "campaigns", label: "Campaign Dialer", icon: ListOrdered },
  { key: "message-campaigns", label: "Message Campaigns", icon: MessageSquareText },
  { key: "logs", label: "Call Logs", icon: ScrollText },
  { key: "settings", label: "Settings", icon: Settings2, admin: true },
];
const TONE = { connected: "text-[#2D6A4F]", dnp: "text-clay", busy: "text-clay", failed: "text-[#B03A2E]", pending_credentials: "text-forest/50" };
const inputCls = "h-9 border border-[#E6E4DD] rounded-sm px-3 text-sm bg-white focus:outline-none focus:border-forest";
const btn = "h-9 px-3 rounded-sm text-sm font-medium inline-flex items-center gap-2 transition-colors duration-150";
const err = (e) => toast.error(formatApiError(e.response?.data?.detail));

const Stat = ({ label, value, icon: Icon, testId }) => (
  <div data-testid={testId} className="border border-[#E6E4DD] bg-white rounded-sm p-5">
    <div className="flex items-center justify-between"><div className="label-caps">{label}</div>{Icon && <Icon className="h-4 w-4 text-forest/40" />}</div>
    <div className="font-display font-black text-3xl text-forest mt-2 tabular-nums">{value ?? 0}</div>
  </div>
);

const CallTable = ({ rows, testId }) => (
  <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-auto" data-testid={testId}>
    <table className="w-full text-sm min-w-max">
      <thead className="bg-bone-alt/60 border-b border-[#E6E4DD]"><tr className="text-[10px] uppercase tracking-[0.15em] text-forest/60">
        {["Lead", "From", "To", "Direction", "Status", "Duration", "Recording", "When"].map((h) => <th key={h} className="text-left px-3 py-2.5 font-bold">{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-[#E6E4DD]">
        {rows.map((c) => (
          <tr key={c.id} className="hover:bg-bone-alt/30 transition-colors duration-100">
            <td className="px-3 py-2.5">{c.lead_id ? <Link to={`/leads/${c.lead_id}`} className="text-forest hover:text-clay underline-offset-2 hover:underline">{c.lead_name}</Link> : c.lead_name || "—"}</td>
            <td className="px-3 py-2.5 tabular-nums">{c.phone_from || "—"}</td><td className="px-3 py-2.5 tabular-nums">{c.phone_to || "—"}</td>
            <td className="px-3 py-2.5 capitalize">{c.direction}</td>
            <td className={`px-3 py-2.5 font-medium uppercase text-[11px] tracking-[0.1em] ${TONE[c.status] || "text-forest"}`}>{(c.status || "").replace("_", " ")}</td>
            <td className="px-3 py-2.5 tabular-nums">{c.duration_sec || 0}s</td>
            <td className="px-3 py-2.5">{c.recording_url ? <audio controls src={c.recording_url} className="h-8 w-48" /> : "—"}</td>
            <td className="px-3 py-2.5 text-forest/60">{relTime(c.created_at)}</td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-forest/50">No calls yet.</td></tr>}
      </tbody>
    </table>
  </div>
);

function DashboardTab({ status }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/callerdesk/dashboard").then((r) => setD(r.data)).catch(err); }, []);
  return (
    <div className="space-y-6">
      {!status?.configured && <div data-testid="cd-pending-banner" className="border border-clay/40 bg-clay/5 rounded-sm p-4 text-sm text-forest">Calling keys (CallerDesk) are not added yet. Calls are logged as <b>pending</b> and nothing is dialled until an admin adds them in Settings.</div>}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat testId="cd-stat-total" label="Calls today" value={d?.total_calls} icon={PhoneOutgoing} />
        <Stat testId="cd-stat-connected" label="Connected" value={d?.connected} icon={PhoneCall} />
        <Stat testId="cd-stat-dnp" label="DNP" value={d?.dnp} icon={PhoneMissed} />
        <Stat testId="cd-stat-failed" label="Failed / busy" value={d?.failed} icon={PhoneOff} />
        <Stat testId="cd-stat-campaigns" label="Active campaigns" value={d?.active_campaigns} />
        <Stat testId="cd-stat-pending" label="Queued numbers" value={d?.pending_campaign_calls} />
      </div>
      <div><div className="label-caps mb-2">Recent calls</div><CallTable rows={d?.recent || []} testId="cd-recent-calls" /></div>
    </div>
  );
}

function DialerTab({ leads }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const call = async (l) => {
    setBusy(l.id);
    try {
      const { data } = await api.post(`/leads/${l.id}/call`);
      if (data.status === "pending_credentials") toast.info("Calling keys not added yet — call logged as pending");
      else toast.success(`Ringing your phone… (${data.status})`);
    } catch (e) { err(e); } finally { setBusy(""); }
  };
  const list = leads.filter((l) => l.phone && (!q || `${l.name} ${l.phone}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 60);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 max-w-md"><Search className="h-4 w-4 text-forest/50" /><input data-testid="cd-dialer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads by name or number" className={`${inputCls} flex-1`} /></div>
      <div className="text-xs text-forest/60">Business Campaign calling rings your phone first (set it in My profile), then connects the lead.</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((l) => (
          <div key={l.id} className="border border-[#E6E4DD] bg-white rounded-sm p-4 flex items-center justify-between gap-3">
            <div className="min-w-0"><Link to={`/leads/${l.id}`} className="font-medium text-forest truncate block hover:text-clay">{l.name}</Link><div className="text-xs text-forest/50 tabular-nums">{l.phone}</div></div>
            <button data-testid={`cd-dial-${l.id}`} disabled={busy === l.id} onClick={() => call(l)} className={`${btn} bg-forest text-white hover:bg-forest-soft disabled:opacity-60`}><PhoneCall className="h-4 w-4" /> Call</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StagePicker({ value, onChange, testPrefix }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {STAGE_META.map((s) => (
        <button key={s.key} type="button" data-testid={`${testPrefix}-${s.key}`} onClick={() => toggle(s.key)}
          className={`h-7 px-2.5 rounded-sm text-xs border transition-colors duration-150 ${value.includes(s.key) ? "bg-forest text-white border-forest" : "bg-white text-forest/70 border-[#E6E4DD] hover:border-forest"}`}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

function CampaignsTab() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState(""); const [numbers, setNumbers] = useState(""); const [stages, setStages] = useState([]); const [cpm, setCpm] = useState(3);
  const [skipToday, setSkipToday] = useState(true); const [autoStart, setAutoStart] = useState(true);
  const [preview, setPreview] = useState(null); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const load = () => api.get("/callerdesk/campaigns").then((r) => setItems(r.data.items)).catch(err);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!stages.length) { setPreview(null); return; }
    api.get("/callerdesk/campaigns/stage-preview", { params: { stages: stages.join(","), skip_called_today: skipToday } }).then((r) => setPreview(r.data)).catch(err);
  }, [stages, skipToday]);
  const create = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/callerdesk/campaigns", { name, stages, skip_called_today: skipToday, auto_start: autoStart, numbers: numbers.split(/[\s,]+/).filter(Boolean), calls_per_minute: Number(cpm) });
      toast.success(data.run ? `Campaign started · ${data.total_numbers} lead(s) imported, ${data.run.started} call(s) dialled` : `Campaign saved · ${data.total_numbers} lead(s) imported`);
      setName(""); setNumbers(""); setStages([]); setSkipToday(true); setAutoStart(true); load();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const act = async (id, type) => {
    try {
      if (type === "delete") await api.delete(`/callerdesk/campaigns/${id}`);
      else { const { data } = await api.post(`/callerdesk/campaigns/${id}/${type}`); if (type === "start") toast.success(`Started ${data.started} call(s), ${data.pending} queued`); }
      load();
      if (open?.id === id) view(id);
    } catch (e) { err(e); }
  };
  const view = async (id) => { const { data } = await api.get(`/callerdesk/campaigns/${id}/calls`); setOpen({ id, rows: data.items }); };
  return (
    <div className="space-y-6">
      <div className="border border-[#E6E4DD] bg-white rounded-sm p-5 space-y-4" data-testid="cd-camp-form">
        <div className="grid lg:grid-cols-[1.2fr_1.4fr_120px] gap-3">
          <label className="text-xs text-forest/60">Campaign name<input data-testid="cd-camp-name" value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
          <label className="text-xs text-forest/60">Extra numbers (optional, comma separated)<input data-testid="cd-camp-numbers" value={numbers} onChange={(e) => setNumbers(e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
          <label className="text-xs text-forest/60">Calls / minute<input data-testid="cd-camp-cpm" type="number" min={1} max={20} value={cpm} onChange={(e) => setCpm(e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
        </div>
        <div>
          <div className="text-xs text-forest/60 mb-1.5">Import leads currently in these stages</div>
          <StagePicker value={stages} onChange={setStages} testPrefix="cd-camp-stage" />
          {preview && <div data-testid="cd-camp-preview" className="text-xs text-forest mt-2"><b>{preview.count}</b> lead(s) will be imported{preview.skipped ? ` · ${preview.skipped} skipped (already called today)` : ""}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-forest"><Switch data-testid="cd-camp-skip-today" checked={skipToday} onCheckedChange={setSkipToday} /> Skip leads already called today</label>
          <label className="inline-flex items-center gap-2 text-sm text-forest"><Switch data-testid="cd-camp-autostart" checked={autoStart} onCheckedChange={setAutoStart} /> Start dialling right away</label>
          <button data-testid="cd-camp-create" disabled={busy || !name.trim()} onClick={create} className={`${btn} bg-forest text-white hover:bg-forest-soft disabled:opacity-60 ml-auto`}>{autoStart ? <><Play className="h-4 w-4" /> Create & start</> : "Create campaign"}</button>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        {items.map((c) => (
          <div key={c.id} data-testid={`cd-camp-${c.id}`} className="border border-[#E6E4DD] bg-white rounded-sm p-4">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => view(c.id)} className="font-display font-bold text-lg text-forest hover:text-clay text-left">{c.name}</button>
              <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-forest/60">{c.status}</span>
            </div>
            {c.stages?.length > 0 && <div className="text-[11px] text-forest/50 mt-0.5">Stages: {c.stages.map((s) => STAGE_LABEL[s] || s).join(", ")}</div>}
            <div className="text-xs text-forest/60 mt-1 flex gap-4"><span>Total <b>{c.total_numbers}</b></span><span>Queued <b>{c.pending_numbers}</b></span><span>Connected <b>{c.connected_numbers}</b></span><span>DNP <b>{c.dnp_numbers}</b></span></div>
            <div className="mt-3 flex gap-2">
              {c.status !== "active" && !["completed", "cancelled"].includes(c.status) && <button data-testid={`cd-camp-start-${c.id}`} onClick={() => act(c.id, "start")} className={`${btn} border border-[#E6E4DD] hover:border-forest`}><Play className="h-3.5 w-3.5" /> Start</button>}
              {c.status === "active" && <button data-testid={`cd-camp-pause-${c.id}`} onClick={() => act(c.id, "pause")} className={`${btn} border border-[#E6E4DD] hover:border-forest`}><Pause className="h-3.5 w-3.5" /> Pause</button>}
              {!["completed", "cancelled"].includes(c.status) && <button data-testid={`cd-camp-cancel-${c.id}`} onClick={() => act(c.id, "delete")} className={`${btn} border border-[#E6E4DD] hover:border-clay text-clay`}><Trash2 className="h-3.5 w-3.5" /> Cancel</button>}
            </div>
            {open?.id === c.id && (
              <div className="mt-3 border-t border-[#E6E4DD] pt-2 max-h-48 overflow-y-auto space-y-1" data-testid={`cd-camp-numbers-${c.id}`}>
                {open.rows.map((n) => <div key={n.id} className="text-xs flex justify-between"><span>{n.lead_name || "Number"} <span className="text-forest/50 tabular-nums">{n.phone}</span></span><span className={`uppercase font-bold ${TONE[n.status] || "text-forest/60"}`}>{(n.status || "").replace("_", " ")}</span></div>)}
              </div>
            )}
          </div>
        ))}
        {!items.length && <div className="border border-dashed border-[#E6E4DD] rounded-sm p-10 text-center text-forest/50 text-sm lg:col-span-2">No campaigns yet.</div>}
      </div>
    </div>
  );
}

function MessageCampaignsTab({ leads }) {
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ name: "", channel: "whatsapp", stage: "", subject: "", message: "Hi {name}, " });
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/message-campaigns").then((r) => setItems(r.data)).catch(err);
  useEffect(() => { load(); }, []);
  const stages = [...new Set(leads.map((l) => l.stage))];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const run = async () => {
    setBusy(true);
    try { const { data } = await api.post("/message-campaigns", f); toast.success(`Sending to ${data.total} lead(s)…`); load(); setTimeout(load, 5000); }
    catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
      <div className="border border-[#E6E4DD] bg-white rounded-sm p-4 space-y-3">
        <label className="block text-xs text-forest/60">Campaign name<input data-testid="mc-name" value={f.name} onChange={set("name")} className={`${inputCls} w-full mt-1`} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-forest/60">Channel<select data-testid="mc-channel" value={f.channel} onChange={set("channel")} className={`${inputCls} w-full mt-1`}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
          <label className="text-xs text-forest/60">Leads in stage<select data-testid="mc-stage" value={f.stage} onChange={set("stage")} className={`${inputCls} w-full mt-1`}><option value="">Pick stage</option>{stages.map((s) => <option key={s} value={s}>{STAGE_LABEL[s] || s}</option>)}</select></label>
        </div>
        {f.channel === "email" && <label className="block text-xs text-forest/60">Subject<input data-testid="mc-subject" value={f.subject} onChange={set("subject")} className={`${inputCls} w-full mt-1`} /></label>}
        <label className="block text-xs text-forest/60">Message ({"{name}"} becomes the lead's name)<textarea data-testid="mc-message" value={f.message} onChange={set("message")} className="mt-1 w-full min-h-28 border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" /></label>
        <button data-testid="mc-send" disabled={busy} onClick={run} className={`${btn} bg-forest text-white hover:bg-forest-soft disabled:opacity-60`}>Send now</button>
      </div>
      <div className="space-y-2" data-testid="mc-list">
        {items.map((c) => (
          <div key={c.id} className="border border-[#E6E4DD] bg-white rounded-sm p-3">
            <div className="flex justify-between"><span className="font-medium text-forest">{c.name}</span><span className="text-[10px] uppercase tracking-[0.15em] font-bold text-forest/50">{c.channel}</span></div>
            <div className="text-xs text-forest/60 mt-1">{c.status === "running" ? "Sending… " : ""}Total {c.total} · Sent {c.sent} · Failed {c.failed} · Skipped {c.skipped} · {relTime(c.created_at)}</div>
            {c.errors?.length > 0 && <div className="text-[11px] text-clay mt-1">{c.errors[0].lead}: {c.errors[0].reason}</div>}
          </div>
        ))}
        {!items.length && <div className="border border-dashed border-[#E6E4DD] rounded-sm p-10 text-center text-forest/50 text-sm">No message campaigns yet.</div>}
      </div>
    </div>
  );
}

function LogsTab() {
  const [f, setF] = useState({ status: "all", direction: "all", date_from: "", date_to: "", search: "" });
  const [rows, setRows] = useState([]);
  const load = () => api.get("/callerdesk/call-logs", { params: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).then((r) => setRows(r.data.items)).catch(err);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select data-testid="cd-logs-status" value={f.status} onChange={set("status")} className={inputCls}>{["all", "connected", "dnp", "busy", "failed", "initiated", "pending_credentials"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace("_", " ")}</option>)}</select>
        <select data-testid="cd-logs-direction" value={f.direction} onChange={set("direction")} className={inputCls}><option value="all">All directions</option><option value="outgoing">Outgoing</option><option value="incoming">Incoming</option></select>
        <input type="date" value={f.date_from} onChange={set("date_from")} className={inputCls} /><input type="date" value={f.date_to} onChange={set("date_to")} className={inputCls} />
        <input data-testid="cd-logs-search" value={f.search} onChange={set("search")} placeholder="Lead or number" className={inputCls} />
        <button data-testid="cd-logs-apply" onClick={load} className={`${btn} bg-forest text-white hover:bg-forest-soft`}>Apply</button>
      </div>
      <CallTable rows={rows} testId="cd-logs-table" />
    </div>
  );
}

function SettingsTab({ status }) {
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm p-5 space-y-4 max-w-2xl" data-testid="cd-settings">
      <div className="font-display font-bold text-lg text-forest">CallerDesk connection</div>
      <div className="text-sm">Status: <b data-testid="cd-config-status" className={status?.configured ? "text-[#2D6A4F]" : "text-clay"}>{status?.configured ? "Connected" : "Keys pending"}</b>{status?.virtual_number && <span className="text-forest/60"> · DID {status.virtual_number}</span>}</div>
      <div className="text-xs text-forest/60">All calls (lead Call button and Campaign Dialer) go through CallerDesk. Keys are managed securely on the server (CALLERDESK_AUTHCODE, CALLERDESK_VIRTUAL_NUMBER, CALLERDESK_WEBHOOK_SECRET) and never stored in the app.</div>
      <div><div className="label-caps mb-1">Webhook URL (paste in your CallerDesk account)</div><code data-testid="cd-webhook-url" className="block text-xs bg-bone-alt/60 p-2 rounded-sm break-all">{status?.webhook_url}</code></div>
      {!status?.secret_configured && <div data-testid="cd-secret-warning" className="text-xs text-clay">No webhook secret is set — anyone with the URL could post call updates. Add CALLERDESK_WEBHOOK_SECRET on the server.</div>}
    </div>
  );
}

export default function BusinessCampaign() {
  const { feature = "dashboard" } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [leads, setLeads] = useState([]);
  const loadStatus = () => api.get("/callerdesk/status").then((r) => setStatus(r.data)).catch(err);
  useEffect(() => { loadStatus(); api.get("/leads").then((r) => setLeads(r.data)); }, []);
  const tabs = TABS.filter((t) => !t.admin || user?.role === "admin");
  if (user && !["admin", "manager"].includes(user.role)) return <Navigate to="/" replace />;
  if (feature === "settings" && user?.role !== "admin") return <Navigate to="/callerdesk/dashboard" replace />;
  return (
    <div className="space-y-6" data-testid="callerdesk-page">
      <div>
        <div className="label-caps">Calling & campaigns</div>
        <h2 data-testid="bc-page-title" className="font-display font-black text-3xl text-forest tracking-tight mt-1">Business Campaign</h2>
        <div className="text-sm text-forest/60 mt-1">Click-to-call, campaign dialling and call logs with recordings.</div>
      </div>
      <div className="flex gap-1 border-b border-[#E6E4DD] overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} data-testid={`cd-tab-${t.key}`} onClick={() => nav(`/callerdesk/${t.key}`)}
            className={`h-10 px-4 text-sm inline-flex items-center gap-2 border-b-2 -mb-px transition-colors duration-150 ${feature === t.key ? "border-forest text-forest font-medium" : "border-transparent text-forest/60 hover:text-forest"}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>
      {feature === "dashboard" && <DashboardTab status={status} />}
      {feature === "dialer" && <DialerTab leads={leads} />}
      {feature === "campaigns" && <CampaignsTab />}
      {feature === "message-campaigns" && <MessageCampaignsTab leads={leads} />}
      {feature === "logs" && <LogsTab />}
      {feature === "settings" && user?.role === "admin" && <SettingsTab status={status} />}
    </div>
  );
}
