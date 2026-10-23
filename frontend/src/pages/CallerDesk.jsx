import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, formatApiError, relTime } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { LayoutDashboard, PhoneCall, ListOrdered, ScrollText, Settings2, PhoneOutgoing, PhoneMissed, PhoneOff, Play, Pause, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "dialer", label: "Dialer", icon: PhoneCall },
  { key: "campaigns", label: "Campaign Dialer", icon: ListOrdered },
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
      {!status?.configured && <div data-testid="cd-pending-banner" className="border border-clay/40 bg-clay/5 rounded-sm p-4 text-sm text-forest">CallerDesk keys are not added yet. Calls are logged as <b>pending</b> and nothing is dialled until an admin adds them in Settings.</div>}
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
      if (data.status === "pending_credentials") toast.info("CallerDesk keys not added yet — call logged as pending");
      else toast.success(`Ringing your phone… (${data.status})`);
    } catch (e) { err(e); } finally { setBusy(""); }
  };
  const list = leads.filter((l) => l.phone && (!q || `${l.name} ${l.phone}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 60);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 max-w-md"><Search className="h-4 w-4 text-forest/50" /><input data-testid="cd-dialer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads by name or number" className={`${inputCls} flex-1`} /></div>
      <div className="text-xs text-forest/60">CallerDesk rings your phone first (set it in My profile), then connects the lead.</div>
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

function CampaignsTab({ leads }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState(""); const [numbers, setNumbers] = useState(""); const [stage, setStage] = useState(""); const [cpm, setCpm] = useState(3);
  const [open, setOpen] = useState(null);
  const load = () => api.get("/callerdesk/campaigns").then((r) => setItems(r.data.items)).catch(err);
  useEffect(() => { load(); }, []);
  const stages = [...new Set(leads.map((l) => l.stage))];
  const create = async () => {
    const lead_ids = stage ? leads.filter((l) => l.stage === stage && l.phone).map((l) => l.id) : [];
    try {
      await api.post("/callerdesk/campaigns", { name, lead_ids, numbers: numbers.split(/[\s,]+/).filter(Boolean), calls_per_minute: Number(cpm) });
      toast.success("Campaign created"); setName(""); setNumbers(""); setStage(""); load();
    } catch (e) { err(e); }
  };
  const act = async (id, type) => {
    try {
      if (type === "delete") await api.delete(`/callerdesk/campaigns/${id}`);
      else { const { data } = await api.post(`/callerdesk/campaigns/${id}/${type}`); if (type === "start") toast.success(`Started ${data.started} call(s), ${data.pending} queued`); }
      load();
    } catch (e) { err(e); }
  };
  const view = async (id) => { const { data } = await api.get(`/callerdesk/campaigns/${id}/calls`); setOpen({ id, rows: data.items }); };
  return (
    <div className="space-y-6">
      <div className="border border-[#E6E4DD] bg-white rounded-sm p-4 grid lg:grid-cols-[1fr_1fr_1.4fr_120px_auto] gap-3 items-end">
        <label className="text-xs text-forest/60">Campaign name<input data-testid="cd-camp-name" value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
        <label className="text-xs text-forest/60">Add leads in stage
          <select data-testid="cd-camp-stage" value={stage} onChange={(e) => setStage(e.target.value)} className={`${inputCls} w-full mt-1`}><option value="">None</option>{stages.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
        </label>
        <label className="text-xs text-forest/60">Extra numbers (comma separated)<input data-testid="cd-camp-numbers" value={numbers} onChange={(e) => setNumbers(e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
        <label className="text-xs text-forest/60">Calls / minute<input data-testid="cd-camp-cpm" type="number" min={1} max={20} value={cpm} onChange={(e) => setCpm(e.target.value)} className={`${inputCls} w-full mt-1`} /></label>
        <button data-testid="cd-camp-create" onClick={create} className={`${btn} bg-forest text-white hover:bg-forest-soft`}>Create</button>
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        {items.map((c) => (
          <div key={c.id} data-testid={`cd-camp-${c.id}`} className="border border-[#E6E4DD] bg-white rounded-sm p-4">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => view(c.id)} className="font-display font-bold text-lg text-forest hover:text-clay text-left">{c.name}</button>
              <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-forest/60">{c.status}</span>
            </div>
            <div className="text-xs text-forest/60 mt-1 flex gap-4"><span>Total <b>{c.total_numbers}</b></span><span>Queued <b>{c.pending_numbers}</b></span><span>Connected <b>{c.connected_numbers}</b></span><span>DNP <b>{c.dnp_numbers}</b></span></div>
            <div className="mt-3 flex gap-2">
              {c.status !== "active" && !["completed", "cancelled"].includes(c.status) && <button data-testid={`cd-camp-start-${c.id}`} onClick={() => act(c.id, "start")} className={`${btn} border border-[#E6E4DD] hover:border-forest`}><Play className="h-3.5 w-3.5" /> Start</button>}
              {c.status === "active" && <button data-testid={`cd-camp-pause-${c.id}`} onClick={() => act(c.id, "pause")} className={`${btn} border border-[#E6E4DD] hover:border-forest`}><Pause className="h-3.5 w-3.5" /> Pause</button>}
              {!["completed", "cancelled"].includes(c.status) && <button data-testid={`cd-camp-cancel-${c.id}`} onClick={() => act(c.id, "delete")} className={`${btn} border border-[#E6E4DD] hover:border-clay text-clay`}><Trash2 className="h-3.5 w-3.5" /> Cancel</button>}
            </div>
            {open?.id === c.id && (
              <div className="mt-3 border-t border-[#E6E4DD] pt-2 max-h-48 overflow-y-auto space-y-1" data-testid={`cd-camp-numbers-${c.id}`}>
                {open.rows.map((n) => <div key={n.id} className="text-xs flex justify-between"><span>{n.lead_name || n.phone} <span className="text-forest/50 tabular-nums">{n.phone}</span></span><span className={`uppercase font-bold ${TONE[n.status] || "text-forest/60"}`}>{n.status}</span></div>)}
              </div>
            )}
          </div>
        ))}
        {!items.length && <div className="border border-dashed border-[#E6E4DD] rounded-sm p-10 text-center text-forest/50 text-sm lg:col-span-2">No campaigns yet.</div>}
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

function SettingsTab({ status, reload }) {
  const [form, setForm] = useState({ callerdesk_authcode: "", callerdesk_virtual_number: "", callerdesk_webhook_secret: "" });
  const save = async (extra = {}) => {
    try { await api.patch("/callerdesk/settings", { ...Object.fromEntries(Object.entries(form).filter(([, v]) => v)), ...extra }); toast.success("Saved"); setForm({ callerdesk_authcode: "", callerdesk_virtual_number: "", callerdesk_webhook_secret: "" }); reload(); } catch (e) { err(e); }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="border border-[#E6E4DD] bg-white rounded-sm p-5 space-y-4">
        <div className="flex items-center justify-between"><div><div className="font-display font-bold text-lg text-forest">Use CallerDesk for calls</div><div className="text-xs text-forest/60">When off, the Call button keeps using Twilio.</div></div>
          <Switch data-testid="cd-provider-toggle" checked={status?.provider === "callerdesk"} onCheckedChange={(v) => save({ calling_provider: v ? "callerdesk" : "twilio" })} /></div>
        <div className="text-sm">Status: <b data-testid="cd-config-status" className={status?.configured ? "text-[#2D6A4F]" : "text-clay"}>{status?.configured ? "Connected" : "Keys pending"}</b>{status?.virtual_number && <span className="text-forest/60"> · DID {status.virtual_number}</span>}</div>
        <div><div className="label-caps mb-1">Webhook URL (paste in CallerDesk)</div><code data-testid="cd-webhook-url" className="block text-xs bg-bone-alt/60 p-2 rounded-sm break-all">{status?.webhook_url}</code></div>
      </div>
      <div className="border border-[#E6E4DD] bg-white rounded-sm p-5 space-y-3">
        <div className="font-display font-bold text-lg text-forest">Keys for this organisation</div>
        <div className="text-xs text-forest/60">Optional. Leave blank to use the account keys added for the whole app.</div>
        {[["callerdesk_authcode", "Auth code"], ["callerdesk_virtual_number", "Virtual number (DID)"], ["callerdesk_webhook_secret", "Webhook secret"]].map(([k, l]) => (
          <label key={k} className="block text-xs text-forest/60">{l}<input data-testid={`cd-set-${k}`} type={k === "callerdesk_virtual_number" ? "text" : "password"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={`${inputCls} w-full mt-1`} /></label>
        ))}
        <button data-testid="cd-settings-save" onClick={() => save()} className={`${btn} bg-forest text-white hover:bg-forest-soft`}>Save keys</button>
      </div>
    </div>
  );
}

export default function CallerDesk() {
  const { feature = "dashboard" } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [leads, setLeads] = useState([]);
  const loadStatus = () => api.get("/callerdesk/status").then((r) => setStatus(r.data)).catch(err);
  useEffect(() => { loadStatus(); api.get("/leads").then((r) => setLeads(r.data)); }, []);
  const tabs = TABS.filter((t) => !t.admin || user?.role === "admin");
  return (
    <div className="space-y-6" data-testid="callerdesk-page">
      <div>
        <div className="label-caps">Calling</div>
        <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">CallerDesk</h2>
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
      {feature === "campaigns" && <CampaignsTab leads={leads} />}
      {feature === "logs" && <LogsTab />}
      {feature === "settings" && user?.role === "admin" && <SettingsTab status={status} reload={loadStatus} />}
    </div>
  );
}
