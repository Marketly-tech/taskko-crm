import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError, relTime } from "@/lib/api";
import { Send, ImagePlus, RefreshCcw, X, CheckCheck, FileText } from "lucide-react";
import { toast } from "sonner";

const toBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

const Bubble = ({ m }) => (
  <div className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
    <div data-testid={`wa-msg-${m.id}`} className={`max-w-[75%] rounded-sm px-3 py-2 text-sm ${m.from_me ? "bg-[#DCF8C6] text-forest" : "bg-white border border-[#E6E4DD] text-forest"}`}>
      {m.type !== "text" && (m.media_url ? <img src={m.media_url} alt="" className="max-h-48 rounded-sm mb-1" /> : <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-forest/50 mb-1">[{m.type}]</div>)}
      {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
      <div className="text-[10px] text-forest/45 mt-1 flex items-center gap-1 justify-end">
        {m.from_me && m.actor_name && <span>{m.actor_name} ·</span>}{relTime(m.created_at)}{m.from_me && <CheckCheck className="h-3 w-3" />}
      </div>
    </div>
  </div>
);

const fillTemplate = (body, leadName) => (body || "").replace(/\{\{?\s*(name|lead_name|1)\s*\}?\}/gi, leadName || "there");

const TemplatePicker = ({ leadName, onPick, testId }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const toggle = async () => {
    setOpen(!open);
    if (!items) {
      try { const { data } = await api.get("/whatsapp-templates"); setItems(data); } catch (e) { setItems([]); toast.error(formatApiError(e.response?.data?.detail)); }
    }
  };
  const list = (items || []).filter((t) => !q || `${t.name} ${t.body}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <button data-testid={`${testId}-templates`} onClick={toggle} title="Insert template" className={`h-9 w-9 grid place-items-center rounded-sm transition-colors duration-150 ${open ? "bg-bone-alt text-forest" : "text-forest/60 hover:text-forest hover:bg-bone-alt"}`}><FileText className="h-4 w-4" /></button>
      {open && (
        <div data-testid={`${testId}-template-list`} className="absolute bottom-11 left-0 z-20 w-80 max-h-80 flex flex-col bg-white border border-[#E6E4DD] rounded-sm shadow-lg">
          <div className="p-2 border-b border-[#E6E4DD] flex items-center gap-2">
            <input data-testid={`${testId}-template-search`} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" className="flex-1 text-sm outline-none" />
            <button onClick={() => setOpen(false)} className="text-forest/50 hover:text-forest"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="overflow-y-auto divide-y divide-[#E6E4DD]">
            {items === null && <div className="p-4 text-xs text-forest/50">Loading…</div>}
            {items && list.length === 0 && <div className="p-4 text-xs text-forest/50">No templates yet — add them in WhatsApp Templates.</div>}
            {list.map((t) => (
              <button key={t.id} data-testid={`${testId}-template-${t.id}`} onClick={() => { onPick(fillTemplate(t.body, leadName)); setOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-bone-alt/50 transition-colors duration-150">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-forest truncate">{t.name}</span><span className="text-[9px] uppercase tracking-[0.15em] text-forest/45">{t.category}</span></div>
                <div className="text-xs text-forest/60 line-clamp-2 mt-0.5">{fillTemplate(t.body, leadName)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// basePath: "/leads/<id>/whatsapp" or "/whatsapp/conversations/<id>"
export const WhatsAppChat = ({ fetchPath, sendPath, syncPath, leadName, height = "h-[420px]", testId = "wa-chat" }) => {
  const [msgs, setMsgs] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get(fetchPath);
      if (Array.isArray(data)) setMsgs(data); else { setMsgs(data.messages); setConfigured(data.configured); }
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [fetchPath]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  const send = async () => {
    if (!text.trim() && !file) return;
    if (file && file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5 MB");
    setBusy(true);
    try {
      const body = { text };
      if (file) Object.assign(body, { media_base64: await toBase64(file), mimetype: file.type, file_name: file.name });
      await api.post(sendPath, body);
      setText(""); setFile(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  const sync = async () => {
    try { const { data } = await api.post(syncPath); toast.success(`Synced ${data.synced} new message(s)`); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div data-testid={testId} className="flex flex-col border border-[#E6E4DD] rounded-sm overflow-hidden bg-[#F4F1EA]">
      {!configured && <div data-testid="wa-not-configured" className="px-3 py-2 text-xs bg-clay/10 text-forest border-b border-clay/30">WhatsApp isn't connected yet — an admin needs to link the WhatsApp phone by scanning the QR code in WhatsApp Inbox → Settings.</div>}
      <div className={`overflow-y-auto p-3 space-y-2 ${height}`}>
        {msgs.length === 0 && <div className="text-center text-sm text-forest/50 pt-10">No WhatsApp messages yet.</div>}
        {msgs.map((m) => <Bubble key={m.id} m={m} />)}
        <div ref={endRef} />
      </div>
      {file && <div className="px-3 py-1.5 text-xs bg-white border-t border-[#E6E4DD] flex items-center gap-2">Image: {file.name}<button onClick={() => setFile(null)}><X className="h-3 w-3" /></button></div>}
      <div className="flex items-end gap-2 p-2 bg-white border-t border-[#E6E4DD]">
        {syncPath && <button data-testid={`${testId}-sync`} onClick={sync} title="Sync history" className="h-9 w-9 grid place-items-center rounded-sm text-forest/60 hover:text-forest hover:bg-bone-alt transition-colors duration-150"><RefreshCcw className="h-4 w-4" /></button>}
        <button data-testid={`${testId}-attach`} onClick={() => fileRef.current?.click()} title="Attach image" className="h-9 w-9 grid place-items-center rounded-sm text-forest/60 hover:text-forest hover:bg-bone-alt transition-colors duration-150"><ImagePlus className="h-4 w-4" /></button>
        <TemplatePicker leadName={leadName} testId={testId} onPick={setText} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <textarea data-testid={`${testId}-input`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Type a WhatsApp message" className="flex-1 resize-none min-h-9 max-h-28 border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
        <button data-testid={`${testId}-send`} disabled={busy} onClick={send} className="h-9 px-3 rounded-sm bg-[#128C7E] text-white text-sm inline-flex items-center gap-1.5 hover:bg-[#0f7a6e] disabled:opacity-60 transition-colors duration-150"><Send className="h-4 w-4" /> Send</button>
      </div>
    </div>
  );
};
