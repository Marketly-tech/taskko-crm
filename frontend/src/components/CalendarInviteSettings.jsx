import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const inputCls = "text-forest w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest";

export const CalendarInviteSettings = ({ s, set, savedKey }) => {
  const [st, setSt] = useState(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/calendar/status").then((r) => setSt(r.data)).catch(() => {}); }, [savedKey]);
  const test = async () => {
    setBusy(true);
    try { const { data } = await api.post("/calendar/test", { to: to || undefined }); toast.success(data.mocked ? `Test invite logged (email key missing) for ${data.to}` : `Test invite sent to ${data.to}`); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  return (
    <div className="pl-11 space-y-4" data-testid="calendar-invite-settings">
      <div className="text-xs text-forest/60 max-w-2xl">
        Every scheduled visit emails a Google Calendar invite to the assigned executive, the co-owner(s) and the customer, sent from your organisation's email.
        Changing the visit time updates the event, and cancelling it removes the event. Reminder emails go out 1 day, 2 hours and 10 minutes before the visit.
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="text-xs text-forest/60 md:col-span-1">Organisation email (sender)
          <input data-testid="cal-from-email" value={s.calendar_from_email || ""} onChange={(e) => set("calendar_from_email", e.target.value)} placeholder="visits@rrlgroup.com" className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-forest/60">Sender name
          <input data-testid="cal-from-name" value={s.calendar_from_name || ""} onChange={(e) => set("calendar_from_name", e.target.value)} placeholder="RRL Group" className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-forest/60">Visit length (minutes)
          <input data-testid="cal-duration" type="number" min={15} max={480} value={s.visit_duration_min || 60} onChange={(e) => set("visit_duration_min", Number(e.target.value))} className={`${inputCls} mt-1`} />
        </label>
      </div>
      {st && (
        <div data-testid="cal-domain-status" className={`text-xs flex items-start gap-2 rounded-sm border px-3 py-2 ${st.domain_verified ? "border-[#2D6A4F]/30 bg-[#2D6A4F]/5 text-[#2D6A4F]" : "border-clay/30 bg-clay/5 text-clay"}`}>
          {st.domain_verified ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>
            Sending as <b>{st.from_name} &lt;{st.from_email}&gt;</b> ·{" "}
            {st.domain_verified ? `domain ${st.domain} is verified` : st.domain_status.startsWith("check failed") ? `can't auto-check domain ${st.domain} with the current email key — use "Send test" to confirm delivery` : st.domain_status === "email_key_missing" ? "email service key not added — invites are only logged" : `domain ${st.domain} is ${st.domain_status.replace("_", " ")} — verify it with your email provider (add the DNS records), otherwise invites won't be delivered`}
            {" "}(save settings to re-check)
          </span>
        </div>
      )}
      <div className="flex gap-2 max-w-lg">
        <input data-testid="cal-test-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Send a test invite to (default: you)" className={inputCls} />
        <button data-testid="cal-test-send" onClick={test} disabled={busy} className="h-10 px-4 rounded-sm border border-forest text-forest text-sm whitespace-nowrap hover:bg-forest hover:text-white disabled:opacity-60 transition-colors duration-150">{busy ? "Sending…" : "Send test"}</button>
      </div>
    </div>
  );
};
