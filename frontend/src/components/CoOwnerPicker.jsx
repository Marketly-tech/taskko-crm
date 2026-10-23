import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { UsersRound, X } from "lucide-react";
import { toast } from "sonner";

export const CoOwnerPicker = ({ lead, users, canEdit, onSaved }) => {
  const current = lead.co_assigned_to || [];
  const [busy, setBusy] = useState(false);
  const candidates = users.filter((u) => u.id !== lead.assigned_to && ["executive", "manager"].includes(u.role) && u.active !== false);
  const coOwners = users.filter((u) => current.includes(u.id));

  const save = async (next) => {
    setBusy(true);
    try {
      await api.patch(`/leads/${lead.id}`, { co_assigned_to: next });
      toast.success("Co-owners updated");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };
  const toggle = (id) => save(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  return (
    <div className="mt-4 pt-4 border-t border-[#E6E4DD]" data-testid="lead-coowner-section">
      <div className="label-caps mb-2">Co-owners</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {coOwners.length === 0 && <span className="text-xs text-forest/50">No co-owners</span>}
        {coOwners.map((c) => (
          <span key={c.id} data-testid={`coowner-chip-${c.id}`} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] font-bold rounded-sm bg-wheat/30 text-forest px-2 py-1">
            {c.name}
            {canEdit && (
              <button data-testid={`coowner-remove-${c.id}`} disabled={busy} onClick={() => toggle(c.id)} className="hover:text-clay transition-colors duration-150"><X className="h-3 w-3" /></button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <Popover>
          <PopoverTrigger asChild>
            <button data-testid="coowner-add-btn" className="w-full h-9 rounded-sm border border-dashed border-[#D9D6CC] text-xs text-forest/70 hover:border-forest hover:text-forest inline-flex items-center justify-center gap-2 transition-colors duration-150">
              <UsersRound className="h-3.5 w-3.5" /> Manage co-owners
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 rounded-sm p-2" align="start">
            {candidates.map((u) => (
              <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-bone-alt/60 cursor-pointer text-sm text-forest">
                <Checkbox data-testid={`coowner-option-${u.id}`} checked={current.includes(u.id)} disabled={busy} onCheckedChange={() => toggle(u.id)} />
                <span className="flex-1 truncate">{u.name}</span>
                <span className="text-[9px] uppercase tracking-[0.15em] text-forest/40">{u.role}</span>
              </label>
            ))}
            {candidates.length === 0 && <div className="text-xs text-forest/50 p-2">No team members available</div>}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
