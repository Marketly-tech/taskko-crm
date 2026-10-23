import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError, relTime } from "@/lib/api";
import { Send, ImagePlus, RefreshCcw, X, CheckCheck } from "lucide-react";
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

// basePath: "/leads/<id>/whatsapp" or "/whatsapp/conversations/<id>"
export const WhatsAppChat = ({ fetchPath, sendPath, syncPath, height = "h-[420px]", testId = "wa-chat" }) => {
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
      {!configured && <div data-testid="wa-not-configured" className="px-3 py-2 text-xs bg-clay/10 text-forest border-b border-clay/30">WhatsApp isn't connected yet — incoming messages appear here once an admin connects Evolution API in WhatsApp Inbox → Settings.</div>}
      <div className={`flex-1 overflow-y-auto p-3 space-y-2 ${height}`}>
        {msgs.length === 0 && <div className="text-center text-sm text-forest/50 pt-10">No WhatsApp messages yet.</div>}
        {msgs.map((m) => <Bubble key={m.id} m={m} />)}
        <div ref={endRef} />
      </div>
      {file && <div className="px-3 py-1.5 text-xs bg-white border-t border-[#E6E4DD] flex items-center gap-2">Image: {file.name}<button onClick={() => setFile(null)}><X className="h-3 w-3" /></button></div>}
      <div className="flex items-end gap-2 p-2 bg-white border-t border-[#E6E4DD]">
        {syncPath && <button data-testid={`${testId}-sync`} onClick={sync} title="Sync history" className="h-9 w-9 grid place-items-center rounded-sm text-forest/60 hover:text-forest hover:bg-bone-alt transition-colors duration-150"><RefreshCcw className="h-4 w-4" /></button>}
        <button data-testid={`${testId}-attach`} onClick={() => fileRef.current?.click()} title="Attach image" className="h-9 w-9 grid place-items-center rounded-sm text-forest/60 hover:text-forest hover:bg-bone-alt transition-colors duration-150"><ImagePlus className="h-4 w-4" /></button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <textarea data-testid={`${testId}-input`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Type a WhatsApp message" className="flex-1 resize-none min-h-9 max-h-28 border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
        <button data-testid={`${testId}-send`} disabled={busy} onClick={send} className="h-9 px-3 rounded-sm bg-[#128C7E] text-white text-sm inline-flex items-center gap-1.5 hover:bg-[#0f7a6e] disabled:opacity-60 transition-colors duration-150"><Send className="h-4 w-4" /> Send</button>
      </div>
    </div>
  );
};
