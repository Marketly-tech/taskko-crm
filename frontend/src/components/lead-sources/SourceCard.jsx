import React, { useState } from "react";
import { api, formatApiError, relTime } from "@/lib/api";
import { TYPE_META, urls } from "@/lib/leadSourceGuides";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, BookOpen, Send, ScrollText, KeyRound, Trash2, Users2, Link2 } from "lucide-react";

const btn = "h-8 px-2.5 rounded-sm border border-[#E6E4DD] text-xs font-medium text-forest inline-flex items-center gap-1.5 hover:border-forest transition-colors duration-150";
const inputCls = "h-9 border border-[#E6E4DD] rounded-sm px-3 text-sm text-forest bg-white focus:outline-none focus:border-forest";

const CopyRow = ({ label, value, testId }) => (
  <div className="flex items-center gap-2 border border-[#E6E4DD] rounded-sm px-2.5 py-1.5 bg-bone-alt/30">
    <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-forest/55 w-20 shrink-0">{label}</span>
    <code className="text-[11px] text-forest/85 truncate flex-1" title={value}>{value}</code>
    <button data-testid={testId} onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied`); }} className="text-forest/60 hover:text-forest"><Copy className="h-3.5 w-3.5" /></button>
  </div>
);

const endpointRows = (s) => {
  const u = urls(s);
  if (s.type === "google_ads") return [["Webhook URL", u.google], ["Key", s.key]];
  if (s.type === "facebook") return [["Callback URL", u.meta], ["Verify token", s.verify_token]];
  if (s.type === "api") return [["Endpoint", u.api], ["API key", s.key], ["Keyed URL", u.keyed]];
  return [["Push URL", u.keyed]];
};

const MetaConnect = ({ s, onSaved }) => {
  const [token, setToken] = useState(""); const [secret, setSecret] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/lead-sources/${s.id}`, { ...(token && { meta_page_token: token }), ...(secret && { meta_app_secret: secret }) });
      toast.success(data.meta_page_name ? `Connected to ${data.meta_page_name}` : "Saved"); setToken(""); setSecret(""); onSaved(data);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  return (
    <div className="border-t border-[#E6E4DD] pt-3 space-y-2" data-testid={`ls-meta-${s.id}`}>
      <div className="text-xs text-forest/70">
        {s.meta_page_name ? <>Page <b>{s.meta_page_name}</b> · {s.meta_subscribed ? <span className="text-[#2F6B4F] font-bold">leadgen subscribed</span> : <span className="text-clay">not subscribed: {s.meta_subscribe_error}</span>}</> : "Not connected — paste the Page access token from your Meta app"}
      </div>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input data-testid={`ls-meta-token-${s.id}`} value={token} onChange={(e) => setToken(e.target.value)} placeholder={s.meta_page_token_set ? `Page token ${s.meta_page_token_set}` : "Page access token"} className={inputCls} />
        <input data-testid={`ls-meta-secret-${s.id}`} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={s.meta_app_secret_set ? `App secret ${s.meta_app_secret_set}` : "App secret (optional)"} className={inputCls} />
        <button data-testid={`ls-meta-save-${s.id}`} disabled={busy || (!token && !secret)} onClick={save} className="h-9 px-3 rounded-sm bg-forest text-white text-sm disabled:opacity-50">{busy ? "Connecting…" : "Connect"}</button>
      </div>
    </div>
  );
};

const RotationPicker = ({ s, users, onSaved }) => {
  const execs = users.filter((u) => u.role === "executive" && u.active !== false);
  const toggle = async (id) => {
    const ids = s.executive_ids.includes(id) ? s.executive_ids.filter((x) => x !== id) : [...s.executive_ids, id];
    try { const { data } = await api.patch(`/lead-sources/${s.id}`, { executive_ids: ids }); onSaved(data); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-forest/55 mb-1.5 flex items-center gap-1.5"><Users2 className="h-3 w-3" /> Rotate leads among {s.executive_ids.length ? `${s.executive_ids.length} executive(s)` : "all executives (auto)"}</div>
      <div className="flex flex-wrap gap-1.5">
        {execs.map((u) => (
          <button key={u.id} data-testid={`ls-rr-${s.id}-${u.id}`} onClick={() => toggle(u.id)}
            className={`h-7 px-2.5 rounded-sm text-xs border transition-colors duration-150 ${s.executive_ids.includes(u.id) ? "bg-forest text-white border-forest" : "bg-white text-forest/70 border-[#E6E4DD] hover:border-forest"}`}>{u.name}</button>
        ))}
      </div>
    </div>
  );
};

export const SourceCard = ({ s, users, onChange, onRemove, onGuide, onLog, canDelete }) => {
  const patch = async (body) => { try { const { data } = await api.patch(`/lead-sources/${s.id}`, body); onChange(data); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };
  const test = async () => {
    try { const { data } = await api.post(`/lead-sources/${s.id}/test`); toast[data.http_status < 300 ? "success" : "error"](`Test: ${data.message}`); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const rotate = async () => {
    if (!window.confirm("Reset the key? The old URL/key stops working immediately and the source team must update it.")) return;
    try { const { data } = await api.post(`/lead-sources/${s.id}/rotate-key`); onChange(data); toast.success("New key generated — share the updated guide"); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${s.name}"? Leads already captured stay in the CRM.`)) return;
    try { await api.delete(`/lead-sources/${s.id}`); onRemove(s.id); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <div data-testid={`ls-card-${s.id}`} className={`border bg-white rounded-sm p-5 space-y-4 transition-opacity duration-200 ${s.active ? "border-[#E6E4DD]" : "border-dashed border-[#E6E4DD] opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="label-caps">{TYPE_META[s.type]?.label}</div>
          <div className="font-display font-bold text-xl text-forest tracking-tight truncate">{s.name}</div>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-forest/70 shrink-0">{s.active ? "Live" : "Paused"}<Switch data-testid={`ls-active-${s.id}`} checked={s.active} onCheckedChange={(v) => patch({ active: v })} /></label>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Today", s.today_count], ["Total leads", s.lead_count], ["Repeats", s.duplicate_count]].map(([l, v]) => (
          <div key={l} className="border border-[#E6E4DD] rounded-sm py-2"><div className="font-display font-black text-2xl text-forest tabular-nums">{v || 0}</div><div className="text-[10px] uppercase tracking-[0.14em] text-forest/55">{l}</div></div>
        ))}
      </div>
      <div className="text-xs text-forest/60 flex items-center gap-1.5"><Link2 className="h-3 w-3" /> Last lead: {s.last_lead_at ? relTime(s.last_lead_at) : "never"}</div>
      <div className="space-y-1.5">{endpointRows(s).map(([l, v]) => <CopyRow key={l} label={l} value={v} testId={`ls-copy-${s.id}-${l.replace(/\s+/g, "-").toLowerCase()}`} />)}</div>
      <RotationPicker s={s} users={users} onSaved={onChange} />
      {s.type === "facebook" && <MetaConnect s={s} onSaved={onChange} />}
      <div className="flex flex-wrap gap-2 pt-1">
        <button data-testid={`ls-guide-${s.id}`} onClick={() => onGuide(s)} className={`${btn} bg-forest text-white border-forest hover:bg-forest-soft`}><BookOpen className="h-3.5 w-3.5" /> Share guide</button>
        <button data-testid={`ls-test-${s.id}`} onClick={test} className={btn}><Send className="h-3.5 w-3.5" /> Send test lead</button>
        <button data-testid={`ls-log-${s.id}`} onClick={() => onLog(s)} className={btn}><ScrollText className="h-3.5 w-3.5" /> Live log</button>
        <button data-testid={`ls-rotate-${s.id}`} onClick={rotate} className={btn}><KeyRound className="h-3.5 w-3.5" /> Reset key</button>
        {canDelete && <button data-testid={`ls-delete-${s.id}`} onClick={remove} className={`${btn} text-clay hover:border-clay`}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
    </div>
  );
};
