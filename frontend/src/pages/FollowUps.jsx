import React, { useEffect, useState } from "react";
import { api, relTime } from "@/lib/api";
import { Link } from "react-router-dom";
import { FOLLOWUP } from "@/constants/testIds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Phone, MessageSquare, Mail, Calendar as CalIcon } from "lucide-react";
import { toast } from "sonner";

const KIND_ICON = { call: Phone, whatsapp: MessageSquare, email: Mail, meeting: CalIcon };

export default function FollowUps() {
  const [items, setItems] = useState([]);
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("pending");

  const load = async () => {
    const [fu, l] = await Promise.all([
      api.get("/follow-ups", { params: status ? { status } : {} }),
      api.get("/leads"),
    ]);
    setItems(fu.data);
    setLeads(l.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const complete = async (id) => {
    await api.patch(`/follow-ups/${id}`, { status: "done" });
    toast.success("Follow-up completed");
    load();
  };

  const now = Date.now();
  const overdue = items.filter((i) => new Date(i.due_at).getTime() < now && i.status === "pending");
  const upcoming = items.filter((i) => !overdue.includes(i));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label-caps">Follow-ups</div>
          <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">
            {overdue.length} overdue · {upcoming.length} upcoming
          </h2>
        </div>
        <Select value={status || "__all__"} onValueChange={(v) => setStatus(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[160px] h-9 rounded-sm border-[#E6E4DD]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="missed">Missed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {overdue.length > 0 && (
        <Section title="Overdue" tone="clay" items={overdue} leads={leads} onComplete={complete} />
      )}
      <Section title="Upcoming" tone="forest" items={upcoming} leads={leads} onComplete={complete} />
      {items.length === 0 && (
        <div className="border border-dashed border-[#E6E4DD] rounded-sm p-12 text-center text-forest/50 text-sm">
          You're all caught up.
        </div>
      )}
    </div>
  );
}

function Section({ title, tone, items, leads, onComplete }) {
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm">
      <div className="px-5 py-3 border-b border-[#E6E4DD] flex items-center gap-2 bg-bone-alt/40">
        <div className={`h-2 w-2 rounded-full ${tone === "clay" ? "bg-clay" : "bg-forest"}`} />
        <div className="font-display font-bold text-lg text-forest tracking-tight">{title}</div>
        <div className="text-xs text-forest/50 ml-2">{items.length}</div>
      </div>
      <div className="divide-y divide-[#E6E4DD]">
        {items.map((i) => {
          const lead = leads.find((l) => l.id === i.lead_id);
          const Icon = KIND_ICON[i.kind] || Phone;
          const overdue = new Date(i.due_at).getTime() < Date.now() && i.status === "pending";
          return (
            <div key={i.id} data-testid={FOLLOWUP.row(i.id)} className="px-5 py-4 flex items-center gap-4">
              <div className="h-9 w-9 rounded-sm border border-[#E6E4DD] grid place-items-center text-forest">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                {lead ? (
                  <Link to={`/leads/${lead.id}`} className="font-medium text-forest hover:text-clay transition-colors duration-150">
                    {lead.name}
                  </Link>
                ) : <span className="text-forest/50">Lead removed</span>}
                <div className="text-xs text-forest/60 mt-0.5">
                  <span className="uppercase tracking-[0.15em] font-bold text-[10px] mr-2">{i.kind}</span>
                  {new Date(i.due_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  <span className={`ml-2 ${overdue ? "text-clay font-medium" : "text-forest/40"}`}>· {relTime(i.due_at)}</span>
                </div>
              </div>
              {i.status === "pending" && (
                <button data-testid={FOLLOWUP.completeBtn(i.id)} onClick={() => onComplete(i.id)} className="text-xs h-8 px-3 rounded-sm border border-[#E6E4DD] text-forest hover:border-forest transition-colors duration-150 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                </button>
              )}
              {i.status === "done" && (
                <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#2D6A4F]">Done</span>
              )}
            </div>
          );
        })}
        {items.length === 0 && <div className="px-5 py-6 text-sm text-forest/50">Nothing here.</div>}
      </div>
    </div>
  );
}
