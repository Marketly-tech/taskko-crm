import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, formatApiError, relTime } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppChat } from "@/components/WhatsAppChat";
import { MessageCircle, RefreshCcw, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";

function WASettings({ status, reload }) {
  const [qr, setQr] = useState(null);
  const getQr = async () => { try { const { data } = await api.get("/whatsapp/qrcode"); setQr(data); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };
  const open = status?.state === "open";
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm p-5 grid lg:grid-cols-2 gap-6" data-testid="wa-settings">
      <div className="space-y-3">
        <div className="font-display font-bold text-lg text-forest">WhatsApp connection</div>
        <div className="text-sm">Status: <b data-testid="wa-state" className={open ? "text-[#2D6A4F]" : "text-clay"}>{status?.configured ? (open ? "connected" : status.state.replace(/_/g, " ")) : "not configured"}</b>
          {status?.instance && <span className="text-forest/60"> · instance <code>{status.instance}</code></span>}
        </div>
        {status?.help && <div data-testid="wa-state-help" className="text-xs text-clay bg-clay/5 border border-clay/20 rounded-sm px-3 py-2">{status.help}</div>}
        <div className="text-[11px] text-forest/50">Server details are managed securely on the server (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME) and never stored in the app.</div>
        <div className="flex gap-2">
          {status?.configured && !open && <button data-testid="wa-qr-btn" onClick={getQr} className="h-9 px-4 rounded-sm bg-forest text-white text-sm hover:bg-forest-soft transition-colors duration-150">Show QR to link phone</button>}
          <button data-testid="wa-status-refresh" onClick={reload} className="h-9 px-4 rounded-sm border border-[#E6E4DD] text-sm hover:border-forest transition-colors duration-150 inline-flex items-center gap-2"><RefreshCcw className="h-3.5 w-3.5" /> Check status</button>
        </div>
        {qr?.base64 && <img data-testid="wa-qr-img" src={qr.base64} alt="WhatsApp QR" className="h-56 w-56" />}
        {qr?.pairing_code && <div className="text-sm">Pairing code: <b>{qr.pairing_code}</b></div>}
      </div>
      <div className="space-y-3">
        <div className="label-caps">Webhook URL (set in Evolution for MESSAGES_UPSERT)</div>
        <code data-testid="wa-webhook-url" className="block text-xs bg-bone-alt/60 p-2 rounded-sm break-all">{status?.webhook_url}</code>
      </div>
    </div>
  );
}

export default function WhatsAppInbox() {
  const { chatId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const load = () => api.get("/whatsapp/conversations", { params: q ? { search: q } : {} }).then((r) => setChats(r.data)).catch(() => {});
  const loadStatus = () => api.get("/whatsapp/status").then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => { loadStatus(); }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = chats.find((c) => c.id === chatId);
  const syncAll = async () => { try { const { data } = await api.post("/whatsapp/sync"); toast.success(`Synced ${data.synced} message(s)`); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } };
  const canManage = user?.role === "admin" || user?.role === "manager";

  return (
    <div className="space-y-5" data-testid="wa-inbox-page">
      <div className="flex items-end justify-between gap-4">
        <div><div className="label-caps">Messaging</div><h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">WhatsApp Inbox</h2></div>
        <div className="flex gap-2">
          {canManage && <button data-testid="wa-sync-all" onClick={syncAll} className="h-9 px-3 rounded-sm border border-[#E6E4DD] bg-white text-sm inline-flex items-center gap-2 hover:border-forest transition-colors duration-150"><RefreshCcw className="h-4 w-4" /> Sync</button>}
          {user?.role === "admin" && <button data-testid="wa-settings-toggle" onClick={() => setShowSettings(!showSettings)} className="h-9 px-3 rounded-sm border border-[#E6E4DD] bg-white text-sm inline-flex items-center gap-2 hover:border-forest transition-colors duration-150"><Settings2 className="h-4 w-4" /> Settings</button>}
        </div>
      </div>
      {showSettings && <WASettings status={status} reload={loadStatus} />}
      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <div className="border border-[#E6E4DD] bg-white rounded-sm flex flex-col max-h-[600px]">
          <div className="p-2 border-b border-[#E6E4DD] flex items-center gap-2"><Search className="h-4 w-4 text-forest/50" /><input data-testid="wa-chat-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by lead name" className="flex-1 text-sm outline-none" /></div>
          <div className="overflow-y-auto divide-y divide-[#E6E4DD]" data-testid="wa-chat-list">
            {chats.length === 0 && <div className="p-6 text-center text-sm text-forest/50">No conversations yet.</div>}
            {chats.map((c) => (
              <button key={c.id} data-testid={`wa-chat-${c.id}`} onClick={() => nav(`/whatsapp/${c.id}`)} className={`w-full text-left px-3 py-2.5 transition-colors duration-150 ${c.id === chatId ? "bg-bone-alt" : "hover:bg-bone-alt/50"}`}>
                <div className="flex items-center justify-between gap-2"><span className="font-medium text-sm text-forest truncate">{c.lead_name || c.number}</span><span className="text-[10px] text-forest/45 shrink-0">{relTime(c.last_at)}</span></div>
                <div className="flex items-center justify-between gap-2 mt-0.5"><span className="text-xs text-forest/55 truncate">{c.last_from_me ? "You: " : ""}{c.last_text}</span>{c.unread > 0 && <span className="text-[10px] font-bold bg-[#25D366] text-white rounded-full px-1.5">{c.unread}</span>}</div>
              </button>
            ))}
          </div>
        </div>
        {active ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between"><div><div className="font-display font-bold text-lg text-forest">{active.lead_name || active.number}</div><div className="text-xs text-forest/50 tabular-nums">{active.number}</div></div>
              {active.lead_id && <Link data-testid="wa-open-lead" to={`/leads/${active.lead_id}`} className="text-xs text-clay hover:text-forest">Open lead →</Link>}</div>
            <WhatsAppChat fetchPath={`/whatsapp/conversations/${active.id}/messages`} sendPath={`/whatsapp/conversations/${active.id}/messages`} leadName={active.lead_name} height="h-[480px]" testId="wa-inbox-chat" />
          </div>
        ) : (
          <div className="border border-dashed border-[#E6E4DD] rounded-sm grid place-items-center text-forest/50 text-sm min-h-[400px]"><div className="text-center"><MessageCircle className="h-6 w-6 mx-auto mb-2 opacity-60" />Pick a conversation</div></div>
        )}
      </div>
    </div>
  );
}
