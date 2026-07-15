import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { TEAM } from "@/constants/testIds";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Phone, Check, X } from "lucide-react";
import { toast } from "sonner";

const ROLE_TONE = {
  admin: "bg-forest text-white",
  manager: "bg-clay/10 text-clay border border-clay/30",
  executive: "bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/30",
};

function PhoneCell({ member, canEdit, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(member.phone || "");
  useEffect(() => setVal(member.phone || ""), [member.phone]);
  const save = async () => {
    try {
      await api.patch(`/users/${member.id}`, { phone: val });
      toast.success("Phone updated");
      setEdit(false);
      onSaved?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  if (!edit) {
    return (
      <div className="flex items-center gap-2 text-forest/70 text-xs">
        {member.phone ? <span className="tabular-nums">{member.phone}</span> : <span className="text-clay">Not set</span>}
        {canEdit && (
          <button onClick={() => setEdit(true)} className="text-forest/40 hover:text-forest transition-colors duration-150 text-[10px] uppercase tracking-[0.15em] font-bold" data-testid={`team-phone-edit-${member.id}`}>
            Edit
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="+9198…"
        className="h-8 w-40 border border-[#E6E4DD] rounded-sm px-2 text-xs focus:outline-none focus:border-forest"
        data-testid={`team-phone-input-${member.id}`}
      />
      <button onClick={save} data-testid={`team-phone-save-${member.id}`} className="text-[#2D6A4F] hover:bg-[#2D6A4F]/10 p-1 rounded-sm transition-colors duration-150"><Check className="h-3.5 w-3.5" /></button>
      <button onClick={() => setEdit(false)} className="text-forest/40 hover:bg-bone-alt p-1 rounded-sm transition-colors duration-150"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export default function Team() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "executive", phone: "" });

  const load = async () => {
    const { data } = await api.get("/users");
    setUsers(data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const body = { ...form };
      if (!body.phone) delete body.phone;
      await api.post("/users", body);
      toast.success("Member added");
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "executive", phone: "" });
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this team member?")) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success("Removed");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-caps">Team</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">
            {users.length} member{users.length === 1 ? "" : "s"}
          </h2>
          <div className="text-sm text-forest/60 mt-1">Add each member's mobile in E.164 format (e.g. +919812345678) so Twilio can bridge outbound calls.</div>
        </div>
        {user?.role === "admin" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button data-testid={TEAM.newBtn} className="h-9 rounded-sm bg-forest text-white text-sm px-3.5 font-medium hover:bg-forest-soft transition-colors duration-150 inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> New member
              </button>
            </DialogTrigger>
            <DialogContent className="rounded-sm">
              <DialogHeader><DialogTitle className="font-display text-2xl">Add team member</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="label-caps mb-1.5">Name</div>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                  </div>
                  <div>
                    <div className="label-caps mb-1.5">Phone (E.164)</div>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+919812345678" className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                  </div>
                </div>
                <div>
                  <div className="label-caps mb-1.5">Email</div>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div>
                  <div className="label-caps mb-1.5">Temporary password</div>
                  <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div>
                  <div className="label-caps mb-1.5">Role</div>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <button data-testid={TEAM.submitBtn} onClick={submit} disabled={!form.name || !form.email || !form.password} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">Create</button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="border border-[#E6E4DD] bg-white rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bone-alt/60 border-b border-[#E6E4DD]">
            <tr className="text-[10px] uppercase tracking-[0.15em] text-forest/70">
              <th className="text-left px-4 py-3 font-bold">Member</th>
              <th className="text-left px-4 py-3 font-bold">Email</th>
              <th className="text-left px-4 py-3 font-bold">Phone</th>
              <th className="text-left px-4 py-3 font-bold">Role</th>
              <th className="text-left px-4 py-3 font-bold">Status</th>
              <th className="text-right px-4 py-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6E4DD]">
            {users.map((u) => (
              <tr key={u.id} data-testid={TEAM.row(u.id)} className="hover:bg-bone-alt/30 transition-colors duration-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-sm bg-forest text-white grid place-items-center text-sm font-display font-bold">{u.name.slice(0, 1)}</div>
                    <div className="font-medium text-forest">{u.name}</div>
                  </div>
                </td>
                <td className="px-4 py-3 text-forest/70">{u.email}</td>
                <td className="px-4 py-3">
                  <PhoneCell member={u} canEdit={user?.role === "admin"} onSaved={load} />
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-[0.15em] font-bold rounded-sm px-2 py-0.5 ${ROLE_TONE[u.role] || ""}`}>{u.role}</span>
                </td>
                <td className="px-4 py-3 text-forest/70 text-xs">
                  {u.active === false ? "Disabled" : "Active"}
                </td>
                <td className="px-4 py-3 text-right">
                  {user?.role === "admin" && user?.id !== u.id && (
                    <button onClick={() => remove(u.id)} className="text-forest/50 hover:text-clay transition-colors duration-150 p-1.5 rounded-sm">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
