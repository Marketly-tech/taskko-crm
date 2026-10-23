import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, relTime } from "@/lib/api";
import { Link } from "react-router-dom";
import { RefreshCcw } from "lucide-react";

const TONE = { created: "text-[#2F6B4F]", duplicate: "text-[#B7791F]", rejected: "text-clay", error: "text-clay" };

export const EventsDialog = ({ source, onClose }) => {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api.get(`/lead-sources/${source.id}/events`).then((r) => setItems(r.data.items));
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [source.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="ls-events-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-forest">{source.name} · live log</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5"><RefreshCcw className="h-3 w-3" /> Every request this source sends, refreshed every 3 seconds</DialogDescription>
        </DialogHeader>
        {items === null && <div className="text-sm text-forest/50">Loading…</div>}
        {items?.length === 0 && <div className="text-sm text-forest/50 py-8 text-center">Nothing received yet. Use "Send test lead" or share the guide with the source team.</div>}
        <div className="divide-y divide-[#E6E4DD]">
          {items?.map((e) => (
            <div key={e.id} data-testid={`ls-event-${e.id}`} className="py-2.5">
              <div className="flex items-center gap-3 text-sm">
                <span className={`text-[10px] uppercase tracking-[0.15em] font-bold w-20 ${TONE[e.status] || ""}`}>{e.status}</span>
                <span className="flex-1 min-w-0 truncate text-forest/80">{e.message}</span>
                <span className="text-xs text-forest/50 tabular-nums">{e.latency_ms} ms</span>
                <span className="text-xs text-forest/50 w-24 text-right">{relTime(e.created_at)}</span>
                {e.lead_id && <Link to={`/leads/${e.lead_id}`} onClick={onClose} className="text-xs font-bold text-forest hover:text-clay">Open</Link>}
                <button onClick={() => setOpen(open === e.id ? null : e.id)} className="text-xs text-forest/60 hover:text-forest">{open === e.id ? "Hide" : "Payload"}</button>
              </div>
              {open === e.id && <pre className="mt-2 bg-bone-alt/60 rounded-sm p-2 text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(e.payload, null, 2)}</pre>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
