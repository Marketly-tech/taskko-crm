import React, { useEffect, useState } from "react";
import { api, formatApiError, inr } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useProjects } from "@/contexts/ProjectContext";
import { PROJECT } from "@/constants/testIds";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Plus, MapPin, Home, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Projects() {
  const { user } = useAuth();
  const { refresh } = useProjects();
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", city: "", price_min: "", price_max: "", cover: "", description: "", configurations: "" });

  const load = async () => {
    const { data } = await api.get("/projects");
    setProjects(data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const body = {
        ...form,
        price_min: form.price_min ? Number(form.price_min) : null,
        price_max: form.price_max ? Number(form.price_max) : null,
        configurations: form.configurations ? form.configurations.split(",").map((s) => s.trim()) : [],
      };
      await api.post("/projects", body);
      toast.success("Project created");
      setOpen(false); setForm({ name: "", location: "", city: "", price_min: "", price_max: "", cover: "", description: "", configurations: "" });
      load(); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const canCreate = user?.role === "admin" || user?.role === "manager";
  const canDelete = user?.role === "admin";
  const [edit, setEdit] = useState(null); // project being edited
  const [editForm, setEditForm] = useState({});

  const openEdit = (p) => {
    setEdit(p);
    setEditForm({
      name: p.name, location: p.location, city: p.city || "", rera: p.rera || "",
      price_min: p.price_min ?? "", price_max: p.price_max ?? "",
      configurations: (p.configurations || []).join(", "), cover: p.cover || "",
      description: p.description || "", status: p.status || "active",
    });
  };

  const submitEdit = async () => {
    try {
      const body = {
        ...editForm,
        price_min: editForm.price_min === "" ? null : Number(editForm.price_min),
        price_max: editForm.price_max === "" ? null : Number(editForm.price_max),
        configurations: editForm.configurations ? editForm.configurations.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };
      await api.patch(`/projects/${edit.id}`, body);
      toast.success("Project updated");
      setEdit(null);
      load(); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this project and all its units?")) return;
    try {
      await api.delete(`/projects/${id}`);
      toast.success("Project deleted");
      load(); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-caps">Portfolio</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </h2>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button data-testid={PROJECT.newBtn} className="h-9 rounded-sm bg-forest text-white text-sm px-3.5 font-medium hover:bg-forest-soft transition-colors duration-150 inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> New project
              </button>
            </DialogTrigger>
            <DialogContent className="rounded-sm max-w-lg">
              <DialogHeader><DialogTitle className="font-display text-2xl">New project</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <div className="label-caps mb-1.5">Name</div>
                  <input data-testid={PROJECT.nameInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="label-caps mb-1.5">Location</div>
                    <input data-testid={PROJECT.locationInput} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                  </div>
                  <div>
                    <div className="label-caps mb-1.5">City</div>
                    <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="label-caps mb-1.5">Price min (₹)</div>
                    <input data-testid={PROJECT.priceMinInput} type="number" value={form.price_min} onChange={(e) => setForm({ ...form, price_min: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                  </div>
                  <div>
                    <div className="label-caps mb-1.5">Price max (₹)</div>
                    <input data-testid={PROJECT.priceMaxInput} type="number" value={form.price_max} onChange={(e) => setForm({ ...form, price_max: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                  </div>
                </div>
                <div>
                  <div className="label-caps mb-1.5">Configurations (comma sep)</div>
                  <input value={form.configurations} onChange={(e) => setForm({ ...form, configurations: e.target.value })} placeholder="2BHK, 3BHK, 4BHK" className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div>
                  <div className="label-caps mb-1.5">Cover image URL</div>
                  <input value={form.cover} onChange={(e) => setForm({ ...form, cover: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div>
                  <div className="label-caps mb-1.5">Description</div>
                  <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
                </div>
              </div>
              <DialogFooter>
                <button data-testid={PROJECT.submitBtn} onClick={submit} disabled={!form.name} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-50">Create</button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((p) => (
          <div
            key={p.id}
            data-testid={PROJECT.card(p.id)}
            className="group bg-white border border-[#E6E4DD] rounded-sm overflow-hidden hover:shadow-sm transition-shadow duration-200"
          >
            <div className="aspect-[16/10] relative bg-forest overflow-hidden">
              {p.cover ? (
                <img src={p.cover} alt={p.name} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
              ) : (
                <div className="w-full h-full grid place-items-center text-white/40"><Building2 className="h-10 w-10" /></div>
              )}
              <div className="absolute top-3 left-3 bg-white/95 backdrop-blur text-[10px] uppercase tracking-[0.18em] font-bold text-forest px-2 py-1 rounded-sm">
                {p.status || "active"}
              </div>
              {canCreate && (
                <div className="absolute top-3 right-3 flex items-center gap-1">
                  <button data-testid={`project-edit-${p.id}`} onClick={() => openEdit(p)} className="bg-white/95 backdrop-blur text-forest hover:bg-white p-1.5 rounded-sm transition-colors duration-150" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {canDelete && (
                    <button onClick={() => remove(p.id)} className="bg-white/95 backdrop-blur text-clay hover:bg-white p-1.5 rounded-sm transition-colors duration-150" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 text-xs text-forest/60">
                <MapPin className="h-3.5 w-3.5" />
                {p.location}
              </div>
              <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1.5">{p.name}</h3>
              {(p.configurations || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.configurations.map((c) => (
                    <span key={c} className="text-[10px] uppercase tracking-[0.15em] font-bold text-forest border border-[#E6E4DD] rounded-sm px-2 py-0.5">{c}</span>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-[#E6E4DD] grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-display font-bold text-forest tabular-nums">{p.units_available ?? 0}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-forest/50">Avail</div>
                </div>
                <div>
                  <div className="text-lg font-display font-bold text-forest tabular-nums">{p.units_total ?? 0}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-forest/50">Units</div>
                </div>
                <div>
                  <div className="text-lg font-display font-bold text-forest tabular-nums">{p.leads_count ?? 0}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-forest/50">Leads</div>
                </div>
              </div>
              <div className="mt-4 text-sm text-forest/70 tabular-nums">
                {inr(p.price_min)} – {inr(p.price_max)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="rounded-sm max-w-lg">
          <DialogHeader><DialogTitle className="font-display text-2xl">Edit project</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div>
                <div className="label-caps mb-1.5">Name</div>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="label-caps mb-1.5">Location</div>
                  <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div>
                  <div className="label-caps mb-1.5">City</div>
                  <input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div>
                  <div className="label-caps mb-1.5">Price min (₹)</div>
                  <input type="number" value={editForm.price_min} onChange={(e) => setEditForm({ ...editForm, price_min: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
                <div>
                  <div className="label-caps mb-1.5">Price max (₹)</div>
                  <input type="number" value={editForm.price_max} onChange={(e) => setEditForm({ ...editForm, price_max: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
                </div>
              </div>
              <div>
                <div className="label-caps mb-1.5">Configurations (comma sep)</div>
                <input value={editForm.configurations} onChange={(e) => setEditForm({ ...editForm, configurations: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
              </div>
              <div>
                <div className="label-caps mb-1.5">Cover image URL</div>
                <input value={editForm.cover} onChange={(e) => setEditForm({ ...editForm, cover: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
              </div>
              <div>
                <div className="label-caps mb-1.5">RERA #</div>
                <input value={editForm.rera} onChange={(e) => setEditForm({ ...editForm, rera: e.target.value })} className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
              </div>
              <div>
                <div className="label-caps mb-1.5">Description</div>
                <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="w-full border border-[#E6E4DD] rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-forest" />
              </div>
            </div>
          )}
          <DialogFooter>
            <button data-testid="project-edit-submit" onClick={submitEdit} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
