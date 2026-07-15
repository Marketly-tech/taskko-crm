import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { CONSOLE } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, MessageSquareText, Copy } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", category: "general", body: "", variables: "", approved: false };

export default function WhatsAppTemplates() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = async () => setItems((await api.get("/whatsapp-templates")).data);
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const body = { ...form, variables: form.variables.split(",").map((s) => s.trim()).filter(Boolean) };
      await api.post("/whatsapp-templates", body);
      toast.success("Template created");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete template?")) return;
    await api.delete(`/whatsapp-templates/${id}`); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-caps">Console</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">WhatsApp templates</h2>
          <div className="text-sm text-forest/60 mt-1">Approved templates unlock outbound messaging via Twilio/Gupshup providers.</div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button data-testid={CONSOLE.waNewBtn} className="h-9 rounded-sm bg-forest text-white text-sm px-3.5 font-medium hover:bg-forest-soft transition-colors duration-150 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> New template
            </button>
          </DialogTrigger>
          <DialogContent className="rounded-sm max-w-lg">
            <DialogHeader><DialogTitle className="font-display text-2xl">New template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <div className="label-caps mb-1.5">Name</div>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
              </div>
              <div>
                <div className="label-caps mb-1.5">Category</div>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="greeting">Greeting</SelectItem>
                    <SelectItem value="site_visit">Site visit</SelectItem>
                    <SelectItem value="followup">Follow-up</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="label-caps mb-1.5">Message body (use &#123;&#123;name&#125;&#125; etc.)</div>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} className="w-full border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
              </div>
              <div>
                <div className="label-caps mb-1.5">Variables (comma sep)</div>
                <input value={form.variables} onChange={(e) => setForm({ ...form, variables: e.target.value })} placeholder="name, project, date" className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.approved} onCheckedChange={(v) => setForm({ ...form, approved: v })} />
                <div className="text-sm">Marked as approved by provider</div>
              </div>
            </div>
            <DialogFooter>
              <button data-testid={CONSOLE.waSubmitBtn} onClick={submit} disabled={!form.name || !form.body} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">Create</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((t) => (
          <div key={t.id} data-testid={CONSOLE.waRow(t.id)} className="border border-[#E6E4DD] bg-white rounded-sm p-5">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-sm bg-[#25D366]/10 text-[#128C7E] grid place-items-center"><MessageSquareText className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-display font-bold text-lg text-forest tracking-tight">{t.name}</div>
                  <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-forest/60 border border-[#E6E4DD] rounded-sm px-1.5 py-0.5">{t.category}</span>
                  {t.approved
                    ? <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-[#2D6A4F]">Approved</span>
                    : <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-clay">Draft</span>}
                </div>
                <div className="mt-3 text-sm text-forest/80 bg-bone-alt/50 border border-[#E6E4DD] rounded-sm p-3 whitespace-pre-wrap">{t.body}</div>
                {(t.variables || []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {t.variables.map((v) => <span key={v} className="text-[10px] font-mono text-forest/70 border border-[#E6E4DD] rounded-sm px-1.5 py-0.5">{`{{${v}}}`}</span>)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { navigator.clipboard.writeText(t.body); toast.success("Copied"); }} className="text-forest/50 hover:text-forest p-1.5 transition-colors duration-150"><Copy className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(t.id)} className="text-forest/50 hover:text-clay p-1.5 transition-colors duration-150"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="border border-dashed border-[#E6E4DD] rounded-sm p-12 col-span-full text-center text-forest/50 text-sm">No templates yet.</div>}
      </div>
    </div>
  );
}
