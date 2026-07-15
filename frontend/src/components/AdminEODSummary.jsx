import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { DASH } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Calendar, Phone, PhoneMissed, PhoneCall, Clock, Trophy,
  BellRing, Send, X,
} from "lucide-react";

function fmtHMS(sec) {
  if (!sec || sec <= 0) return "0m";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatCell({ icon: Icon, label, value, tone }) {
  const toneCls =
    tone === "green" ? "text-[#2D6A4F]" :
    tone === "clay" ? "text-clay" :
    "text-forest";
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm p-4">
      <div className="flex items-center justify-between">
        <div className="label-caps">{label}</div>
        <Icon className="h-4 w-4 text-forest/50" strokeWidth={1.75} />
      </div>
      <div className={`font-display font-black text-3xl tracking-tight mt-2 tabular-nums ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function SummaryBody({ data, compact }) {
  if (!data) {
    return <div className="text-sm text-forest/50 py-6 text-center">Preparing your report…</div>;
  }
  const c = data.calls;
  const m = data.milestones;
  const f = data.followups;

  return (
    <>
      <div className={`grid ${compact ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3"} gap-3`}>
        <StatCell icon={Trophy} label="Bookings" value={m.bookings} tone="green" />
        <StatCell icon={Calendar} label="New leads" value={m.new_leads} />
        <StatCell icon={Calendar} label="Site visits done" value={m.site_visits_completed} />
        <StatCell icon={Phone} label="Total calls" value={c.total} />
        <StatCell icon={PhoneCall} label="Connected" value={c.connected} tone="green" />
        <StatCell icon={Clock} label="Talk time" value={fmtHMS(c.talk_time_sec)} />
      </div>

      <div className={`grid ${compact ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2"} gap-3 mt-3`}>
        <div className="border border-[#E6E4DD] bg-white rounded-sm p-4">
          <div className="flex items-center justify-between">
            <div className="label-caps">Follow-ups</div>
            <BellRing className="h-4 w-4 text-forest/50" strokeWidth={1.75} />
          </div>
          <div className="mt-2 text-sm text-forest/70">
            <span className="font-display font-bold text-forest tabular-nums">{f.due_today}</span> due today
            {" · "}
            <span className={`font-display font-bold tabular-nums ${f.overdue > 0 ? "text-clay" : "text-forest"}`}>{f.overdue}</span> overdue
          </div>
        </div>
        <div className="border border-[#E6E4DD] bg-white rounded-sm p-4">
          <div className="flex items-center justify-between">
            <div className="label-caps">Missed calls today</div>
            <PhoneMissed className="h-4 w-4 text-clay" strokeWidth={1.75} />
          </div>
          <div className="font-display font-black text-3xl text-forest tracking-tight mt-2 tabular-nums">{c.missed}</div>
        </div>
      </div>

      {data.top_execs && data.top_execs.length > 0 && (
        <div className="mt-3 border border-[#E6E4DD] bg-white rounded-sm">
          <div className="px-4 py-2 border-b border-[#E6E4DD] bg-bone-alt/40 label-caps">
            Top executives · today
          </div>
          <div className="divide-y divide-[#E6E4DD]">
            {data.top_execs.map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="h-6 w-6 rounded-sm bg-forest text-white grid place-items-center text-[10px] font-display font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 text-sm text-forest truncate">{t.name}</div>
                <div className="text-xs text-forest/60 tabular-nums">{t.calls} calls</div>
                <div className="text-xs text-forest/60 tabular-nums w-16 text-right">{fmtHMS(t.talk_time_sec)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminEODSummary({ mode = "card" }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!user || user.role !== "admin") return;
    try {
      const r = await api.get("/admin/eod-summary");
      setData(r.data);
    } catch {}
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-open modal once per day for admin after 6PM local
  useEffect(() => {
    if (mode !== "modal-controller") return;
    if (!user || user.role !== "admin") return;
    const now = new Date();
    if (now.getHours() < 18) return;
    const key = `tasko-eod-shown-${now.toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;
    setModalOpen(true);
    localStorage.setItem(key, "1");
  }, [user, mode]);

  const sendEmail = async () => {
    setSending(true);
    try {
      const r = await api.post("/admin/eod-email/send");
      const errs = r.data?.errors || [];
      if (r.data.sent > 0) {
        toast.success(`EOD report emailed to ${r.data.sent} admin${r.data.sent !== 1 ? "s" : ""}.`);
      } else if (errs.length > 0) {
        toast.error(`Email failed for ${errs.length} admin${errs.length !== 1 ? "s" : ""}: ${errs[0].error?.slice(0, 160) || "unknown error"}`);
      } else {
        toast.warning("No admin recipients found.");
      }
    } catch (e) {
      toast.error("Failed to send email: " + (e.response?.data?.detail || e.message));
    } finally {
      setSending(false);
    }
  };

  if (!user || user.role !== "admin") return null;

  if (mode === "modal-controller") {
    return (
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          data-testid={DASH.eodModal}
          className="rounded-sm max-w-2xl bg-bone-alt/40 border-[#E6E4DD]"
        >
          <DialogHeader>
            <div className="label-caps text-clay">End of day · welcome back</div>
            <DialogTitle className="font-display font-black text-3xl text-forest tracking-tight">
              Here's what happened today
            </DialogTitle>
          </DialogHeader>
          <SummaryBody data={data} compact />
          <div className="flex items-center gap-3 mt-4">
            <button
              data-testid={DASH.eodSendEmail}
              onClick={sendEmail}
              disabled={sending}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-sm bg-forest text-white text-xs uppercase tracking-[0.18em] font-bold hover:bg-forest/90 transition-colors disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Email this report"}
            </button>
            <button
              data-testid={DASH.eodDismiss}
              onClick={() => setModalOpen(false)}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-sm border border-[#E6E4DD] bg-white text-forest text-xs uppercase tracking-[0.18em] font-bold hover:border-forest transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Dismiss
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Card mode (dashboard embed)
  return (
    <div data-testid={DASH.eodCard} className="border border-[#E6E4DD] bg-bone-alt/50 rounded-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="label-caps text-clay">Admin · End of day</div>
          <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1">
            Today's summary
          </h3>
          <div className="text-xs text-forest/60 mt-1">
            Auto-emailed to admins at 6:00 PM IST daily.
          </div>
        </div>
        <button
          onClick={sendEmail}
          disabled={sending}
          data-testid={DASH.eodSendEmail}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-sm bg-forest text-white text-xs uppercase tracking-[0.18em] font-bold hover:bg-forest/90 transition-colors disabled:opacity-60"
        >
          <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send now"}
        </button>
      </div>
      <SummaryBody data={data} />
    </div>
  );
}
