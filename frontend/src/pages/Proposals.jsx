import React, { useEffect, useState } from "react";
import { api, formatApiError, inr, relTime } from "@/lib/api";
import { CONSOLE } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const STATUS_TONE = {
  draft: "bg-forest/8 text-forest",
  sent: "bg-[#457B9D]/10 text-[#457B9D]",
  accepted: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
  declined: "bg-clay/10 text-clay",
  expired: "bg-wheat/20 text-[#8A5A2B]",
};

export default function Proposals() {
  const [items, setItems] = useState([]);
  const [leads, setLeads] = useState([]);
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ lead_id: "", project_id: "", amount: "", validity_days: 15, status: "draft", terms: "" });

  const load = async () => {
    const [p, l, pr] = await Promise.all([api.get("/proposals"), api.get("/leads"), api.get("/projects")]);
    setItems(p.data); setLeads(l.data); setProjects(pr.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const body = { ...form, amount: Number(form.amount), validity_days: Number(form.validity_days) };
      if (!body.project_id) delete body.project_id;
      if (!body.terms) delete body.terms;
      await api.post("/proposals", body);
      toast.success("Proposal created");
      setOpen(false); setForm({ lead_id: "", project_id: "", amount: "", validity_days: 15, status: "draft", terms: "" }); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const setStatus = async (id, status) => {
    try { await api.patch(`/proposals/${id}`, { status }); toast.success(`Marked ${status}`); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const groups = ["draft", "sent", "accepted", "declined", "expired"];
  const grouped = Object.fromEntries(groups.map((g) => [g, items.filter((i) => i.status === g)]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-caps">Console</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Proposals</h2>
          <div className="text-sm text-forest/60 mt-1">Track offer letters sent to leads. Accepted proposals contribute to monthly revenue.</div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button data-testid={CONSOLE.propNewBtn} className="h-9 rounded-sm bg-forest text-white text-sm px-3.5 font-medium hover:bg-forest-soft transition-colors duration-150 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> New proposal
            </button>
          </DialogTrigger>
          <DialogContent className="rounded-sm max-w-lg">
            <DialogHeader><DialogTitle className="font-display text-2xl">New proposal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <div className="label-caps mb-1.5">Lead</div>
                <Select value={form.lead_id} onValueChange={(v) => setForm({ ...form, lead_id: v })}>
                  <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Pick a lead" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="label-caps mb-1.5">Project</div>
                <Select value={form.project_id || "__none__"} onValueChange={(v) => setForm({ ...form, project_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="label-caps mb-1.5">Amount (₹)</div>
                  <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div>
                  <div className="label-caps mb-1.5">Validity (days)</div>
                  <input type="number" value={form.validity_days} onChange={(e) => setForm({ ...form, validity_days: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
              </div>
              <div>
                <div className="label-caps mb-1.5">Terms</div>
                <textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} rows={3} className="w-full border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
              </div>
            </div>
            <DialogFooter>
              <button data-testid={CONSOLE.propSubmitBtn} onClick={submit} disabled={!form.lead_id || !form.amount} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">Create</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {groups.map((g) => (
          <div key={g} className="border border-[#E6E4DD] bg-white rounded-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-[0.18em] font-bold text-forest">{g}</div>
              <div className="text-xs text-forest/50">{grouped[g].length}</div>
            </div>
            <div className="font-display font-bold text-2xl text-forest tabular-nums">
              {inr(grouped[g].reduce((sum, p) => sum + (p.amount || 0), 0))}
            </div>
          </div>
        ))}
      </div>

      <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bone-alt/60 border-b border-[#E6E4DD]">
            <tr className="text-[10px] uppercase tracking-[0.15em] text-forest/70">
              <th className="text-left px-4 py-3 font-bold">Lead</th>
              <th className="text-left px-4 py-3 font-bold">Amount</th>
              <th className="text-left px-4 py-3 font-bold">Validity</th>
              <th className="text-left px-4 py-3 font-bold">Status</th>
              <th className="text-left px-4 py-3 font-bold">Created</th>
              <th className="text-right px-4 py-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6E4DD]">
            {items.map((p) => {
              const lead = leads.find((l) => l.id === p.lead_id);
              return (
                <tr key={p.id} className="hover:bg-bone-alt/30 transition-colors duration-100">
                  <td className="px-4 py-3">
                    {lead ? <Link to={`/leads/${lead.id}`} className="font-medium text-forest hover:text-clay transition-colors duration-150">{lead.name}</Link> : <span className="text-forest/50">—</span>}
                  </td>
                  <td className="px-4 py-3 font-display font-bold text-forest tabular-nums">{inr(p.amount)}</td>
                  <td className="px-4 py-3 text-forest/60 text-xs">{p.validity_days || "—"} days</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase tracking-[0.15em] font-bold rounded-sm px-2 py-0.5 ${STATUS_TONE[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-forest/50 text-xs">{relTime(p.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Select value={p.status} onValueChange={(v) => setStatus(p.id, v)}>
                      <SelectTrigger className="w-32 h-8 rounded-sm border-[#E6E4DD] text-xs ml-auto"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-forest/50 text-sm">No proposals yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
