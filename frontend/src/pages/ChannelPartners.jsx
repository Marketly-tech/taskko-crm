import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { CONSOLE } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Phone, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", company: "", phone: "", email: "", city: "", rera: "", commission_pct: "", active: true, notes: "" };

export default function ChannelPartners() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = async () => setItems((await api.get("/channel-partners")).data);
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const body = { ...form, commission_pct: form.commission_pct ? Number(form.commission_pct) : null };
      ["email", "commission_pct", "rera", "city", "phone", "company", "notes"].forEach((k) => { if (!body[k]) delete body[k]; });
      await api.post("/channel-partners", body);
      toast.success("Partner created"); setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove partner?")) return;
    try { await api.delete(`/channel-partners/${id}`); load(); }
    catch { toast.error("Only admins can delete partners"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-caps">Console</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Channel partners</h2>
          <div className="text-sm text-forest/60 mt-1">Brokers, agencies and referrers sourcing leads into Tasko.</div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button data-testid={CONSOLE.cpNewBtn} className="h-9 rounded-sm bg-forest text-white text-sm px-3.5 font-medium hover:bg-forest-soft transition-colors duration-150 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> New partner
            </button>
          </DialogTrigger>
          <DialogContent className="rounded-sm max-w-lg">
            <DialogHeader><DialogTitle className="font-display text-2xl">New partner</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <F label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <F label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
                <F label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                <F label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <F label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                <F label="RERA #" value={form.rera} onChange={(v) => setForm({ ...form, rera: v })} />
                <F label="Commission %" type="number" value={form.commission_pct} onChange={(v) => setForm({ ...form, commission_pct: v })} />
              </div>
            </div>
            <DialogFooter>
              <button data-testid={CONSOLE.cpSubmitBtn} onClick={submit} disabled={!form.name} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">Create</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((p) => (
          <div key={p.id} data-testid={CONSOLE.cpRow(p.id)} className="border border-[#E6E4DD] bg-white rounded-sm p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display font-bold text-xl text-forest tracking-tight">{p.name}</div>
                <div className="text-sm text-forest/60 mt-0.5">{p.company}</div>
              </div>
              <button onClick={() => remove(p.id)} className="text-forest/40 hover:text-clay p-1 transition-colors duration-150"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mt-3 space-y-1.5 text-xs text-forest/70">
              {p.phone && <div className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3" /> {p.phone}</div>}
              {p.email && <div className="inline-flex items-center gap-1.5"><Mail className="h-3 w-3" /> {p.email}</div>}
              {p.city && <div className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {p.city}</div>}
            </div>
            <div className="mt-4 pt-4 border-t border-[#E6E4DD] grid grid-cols-3 gap-2">
              <Stat label="Leads" value={p.leads_count ?? 0} />
              <Stat label="Comm %" value={p.commission_pct ?? "—"} />
              <Stat label="Status" value={p.active === false ? "Off" : "Active"} />
            </div>
            {p.rera && <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-forest/40">RERA · {p.rera}</div>}
          </div>
        ))}
        {items.length === 0 && <div className="border border-dashed border-[#E6E4DD] rounded-sm p-12 col-span-full text-center text-forest/50 text-sm">No partners yet.</div>}
      </div>
    </div>
  );
}

function F({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <div className="label-caps mb-1.5">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="text-center">
      <div className="font-display font-bold text-lg text-forest tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-forest/50 mt-0.5">{label}</div>
    </div>
  );
}
