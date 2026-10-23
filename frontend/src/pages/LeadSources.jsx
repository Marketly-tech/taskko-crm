import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { TYPE_META } from "@/lib/leadSourceGuides";
import { SourceCard } from "@/components/lead-sources/SourceCard";
import { SourceGuide } from "@/components/lead-sources/SourceGuide";
import { EventsDialog } from "@/components/lead-sources/EventsDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Zap } from "lucide-react";

const AddSource = ({ open, onClose, onCreated }) => {
  const [type, setType] = useState("api"); const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try { const { data } = await api.post("/lead-sources", { type, name: name || TYPE_META[type].label }); onCreated(data); setName(""); onClose(); toast.success("Source created — share the guide with the source team"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="ls-add-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl text-forest">Add lead source</DialogTitle><DialogDescription>Each source gets its own secure link and key.</DialogDescription></DialogHeader>
        <div className="grid sm:grid-cols-2 gap-2">
          {Object.entries(TYPE_META).map(([k, m]) => (
            <button key={k} data-testid={`ls-type-${k}`} onClick={() => setType(k)}
              className={`text-left border rounded-sm p-3 transition-colors duration-150 ${type === k ? "border-forest bg-bone-alt/50" : "border-[#E6E4DD] hover:border-forest/50"}`}>
              <div className="text-sm font-medium text-forest">{m.label}</div>
              <div className="text-xs text-forest/60 mt-0.5">{m.hint}</div>
            </button>
          ))}
        </div>
        <label className="text-xs text-forest/60">Name (e.g. "MagicBricks – Skyline" or "Agency XYZ")
          <input data-testid="ls-add-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={TYPE_META[type].label} className="mt-1 w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
        </label>
        <button data-testid="ls-add-submit" disabled={busy} onClick={create} className="h-10 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft disabled:opacity-60 transition-colors duration-150">{busy ? "Creating…" : "Create source"}</button>
      </DialogContent>
    </Dialog>
  );
};

export default function LeadSources() {
  const { user } = useAuth();
  const [items, setItems] = useState(null); const [users, setUsers] = useState([]);
  const [adding, setAdding] = useState(false); const [guide, setGuide] = useState(null); const [log, setLog] = useState(null);
  const load = () => api.get("/lead-sources").then((r) => setItems(r.data.items)).catch((e) => toast.error(formatApiError(e.response?.data?.detail)));
  useEffect(() => {
    if (user?.role === "executive") return undefined;
    load(); api.get("/users").then((r) => setUsers(r.data)).catch(() => {});
    window.addEventListener("propzel:new-lead", load);
    return () => window.removeEventListener("propzel:new-lead", load);
  }, []);
  if (user && !["admin", "manager", "super_admin"].includes(user.role)) return <Navigate to="/" replace />;
  const replace = (s) => setItems((xs) => xs.map((x) => (x.id === s.id ? { ...x, ...s } : x)));
  return (
    <div className="space-y-6" data-testid="lead-sources-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps">Integrations</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Lead Sources</h2>
          <p className="text-sm text-forest/60 mt-1 max-w-2xl flex items-start gap-1.5"><Zap className="h-4 w-4 mt-0.5 text-clay shrink-0" /> Leads pushed by any source appear in Propzel within a second, are rotated to the chosen executives, and alert your team instantly. Repeat numbers are merged into the existing lead.</p>
        </div>
        <button data-testid="ls-add-btn" onClick={() => setAdding(true)} className="h-10 px-4 rounded-sm bg-forest text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-forest-soft transition-colors duration-150"><Plus className="h-4 w-4" /> Add source</button>
      </div>
      {items === null && <div className="text-sm text-forest/50">Loading…</div>}
      {items?.length === 0 && (
        <div className="border border-dashed border-[#E6E4DD] rounded-sm p-12 text-center">
          <div className="font-display font-bold text-xl text-forest">No lead sources yet</div>
          <div className="text-sm text-forest/60 mt-1">Add your website, Facebook, Google Ads, 99acres, MagicBricks, Housing.com or any agency.</div>
        </div>
      )}
      <div className="grid xl:grid-cols-2 gap-4">
        {items?.map((s) => <SourceCard key={s.id} s={s} users={users} onChange={replace} onRemove={(id) => setItems((xs) => xs.filter((x) => x.id !== id))} onGuide={setGuide} onLog={setLog} canDelete={user?.role === "admin" || user?.role === "super_admin"} />)}
      </div>
      <AddSource open={adding} onClose={() => setAdding(false)} onCreated={(s) => setItems((xs) => [...(xs || []), s])} />
      <SourceGuide source={guide} onClose={() => setGuide(null)} />
      {log && <EventsDialog source={log} onClose={() => setLog(null)} />}
    </div>
  );
}
