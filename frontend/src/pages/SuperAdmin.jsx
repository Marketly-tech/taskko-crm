import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, formatApiError, relTime } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { switchOrg } from "@/components/OrgSwitcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Building, Plus, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", slug: "", admin_name: "", admin_email: "", admin_password: "" };

function CreateOrgDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value, ...(k === "name" && !form.slugTouched ? { slug: e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") } : {}) });
  const submit = async () => {
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([k, v]) => v && k !== "slugTouched"));
      await api.post("/organizations", body);
      toast.success("Organisation created");
      setOpen(false); setForm(EMPTY); onCreated();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const fields = [["name", "Organisation name"], ["slug", "Slug (used in webhooks)"], ["admin_name", "Admin name"], ["admin_email", "Admin email"], ["admin_password", "Admin password"]];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button data-testid="sa-create-org-btn" className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-forest-soft transition-colors duration-150"><Plus className="h-4 w-4" /> New organisation</button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New organisation</DialogTitle>
          <DialogDescription className="text-forest/60">Each organisation has its own leads, projects and team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map(([k, label]) => (
            <div key={k}>
              <div className="label-caps mb-1.5">{label}</div>
              <input data-testid={`sa-org-${k}`} type={k === "admin_password" ? "password" : "text"} value={form[k]}
                onChange={k === "slug" ? (e) => setForm({ ...form, slug: e.target.value, slugTouched: true }) : set(k)}
                className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
            </div>
          ))}
        </div>
        <DialogFooter>
          <button data-testid="sa-org-submit" onClick={submit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Create</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, testId }) {
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm p-5" data-testid={testId}>
      <div className="label-caps">{label}</div>
      <div className="font-display font-black text-3xl text-forest mt-2 tabular-nums">{value ?? "—"}</div>
    </div>
  );
}

function OrgRow({ o, activeId, onToggle }) {
  const s = o.stats;
  return (
    <tr data-testid={`sa-org-row-${o.slug}`} className="hover:bg-bone-alt/30 transition-colors duration-100">
      <td className="px-4 py-3">
        <div className="font-medium text-forest flex items-center gap-2"><Building className="h-4 w-4 text-forest/40" />{o.name}
          {o.id === activeId && <span className="text-[9px] uppercase tracking-[0.15em] font-bold bg-wheat/40 px-1.5 py-0.5 rounded-sm">Active</span>}
        </div>
        <div className="text-[11px] text-forest/50 mt-0.5">/{o.slug} · {o.admins.map((a) => a.email).join(", ") || "no admin"}</div>
      </td>
      {[s.users, s.leads, s.booked, s.projects, s.site_visits, s.pending_followups].map((v, i) => <td key={i} className="px-4 py-3 text-sm tabular-nums text-forest/80">{v}</td>)}
      <td className="px-4 py-3"><Switch data-testid={`sa-org-active-${o.slug}`} checked={o.active !== false} onCheckedChange={(v) => onToggle(o, v)} /></td>
      <td className="px-4 py-3">
        <button data-testid={`sa-org-open-${o.slug}`} disabled={o.active === false} onClick={() => switchOrg(o.id)} className="text-xs font-medium text-clay hover:text-forest inline-flex items-center gap-1 disabled:opacity-40 transition-colors duration-150">Open <ArrowUpRight className="h-3.5 w-3.5" /></button>
      </td>
    </tr>
  );
}

export default function SuperAdmin() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);
  const load = async () => {
    const [o, l] = await Promise.all([api.get("/super-admin/overview"), api.get("/super-admin/audit-logs", { params: { limit: 30 } })]);
    setData(o.data); setLogs(l.data);
  };
  useEffect(() => { if (user?.is_super_admin) load(); }, [user]);
  if (!user?.is_super_admin) return <Navigate to="/" replace />;

  const toggle = async (o, active) => {
    try { await api.patch(`/organizations/${o.id}`, { active }); toast.success(active ? "Enabled" : "Disabled"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const t = data?.totals || {};
  return (
    <div className="space-y-8" data-testid="super-admin-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="label-caps text-clay">Control panel</div>
          <h2 className="font-display font-black text-4xl text-forest tracking-tight mt-1">All organisations</h2>
        </div>
        <CreateOrgDialog onCreated={load} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Organisations" value={t.organizations} testId="sa-total-orgs" />
        <Stat label="Active users" value={t.users} testId="sa-total-users" />
        <Stat label="Leads" value={t.leads} testId="sa-total-leads" />
        <Stat label="Booked" value={t.booked} testId="sa-total-booked" />
      </div>
      <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bone-alt/60 border-b border-[#E6E4DD]">
            <tr className="text-[10px] uppercase tracking-[0.15em] text-forest/70">
              {["Organisation", "Users", "Leads", "Booked", "Projects", "Visits", "Pending F/U", "Enabled", ""].map((h) => <th key={h} className="text-left px-4 py-3 font-bold">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6E4DD]">
            {(data?.organizations || []).map((o) => <OrgRow key={o.id} o={o} activeId={user.active_organization_id} onToggle={toggle} />)}
          </tbody>
        </table>
      </div>
      <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
        <div className="label-caps mb-4">Audit log</div>
        <div className="divide-y divide-[#E6E4DD]" data-testid="sa-audit-log">
          {logs.length === 0 && <div className="text-sm text-forest/50 py-2">No audit events yet.</div>}
          {logs.map((l) => (
            <div key={l.id} className="py-2.5 flex items-center justify-between gap-4 text-sm">
              <span className="text-forest">{l.message}</span>
              <span className="text-[11px] text-forest/50 shrink-0">{l.actor_name} · {relTime(l.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
