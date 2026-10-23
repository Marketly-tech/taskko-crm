import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { SETTINGS } from "@/constants/testIds";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarInviteSettings } from "@/components/CalendarInviteSettings";
import { MessageSquare, Mail, Calendar as CalIcon, Zap, Globe } from "lucide-react";

export default function Settings() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [sr] = await Promise.all([api.get("/settings")]);
    setS(sr.data);
  };
  useEffect(() => { load(); }, []);

  const [savedKey, setSavedKey] = useState(0);
  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...s };
      delete payload.id;
      await api.patch("/settings", payload);
      toast.success("Settings saved");
      setSavedKey((k) => k + 1);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  if (!s) return <div className="text-forest/50 text-sm">Loading…</div>;

  const set = (k, v) => setS({ ...s, [k]: v });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="label-caps">Settings</div>
        <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">
          Integrations & automation
        </h2>
      </div>

      <section className="border border-[#E6E4DD] bg-white rounded-sm p-6 space-y-5">
        <Row
          icon={Zap}
          title="Auto-assign new leads"
          hint="Route each incoming lead to the executive with the fewest open leads."
          testId={SETTINGS.toggleAutoAssign}
          checked={!!s.auto_assign_enabled}
          onChange={(v) => set("auto_assign_enabled", v)}
        />
        <Row
          icon={Zap}
          title="Auto-follow-up on missed calls & scheduled visits"
          hint="Create a follow-up task automatically when a call goes unanswered or a visit is booked."
          testId={SETTINGS.toggleAutoFollowup}
          checked={!!s.auto_followup_enabled}
          onChange={(v) => set("auto_followup_enabled", v)}
        />
      </section>

      <section className="border border-[#E6E4DD] bg-white rounded-sm p-6 space-y-5">
        <div>
          <div className="font-display font-bold text-xl text-forest tracking-tight">Channels</div>
          <div className="text-xs text-forest/60 mt-1">Enable outbound channels. WhatsApp connects through the server — link the phone in WhatsApp Inbox → Settings.</div>
        </div>

        <Row
          icon={MessageSquare}
          title="WhatsApp"
          hint="Send drip nudges, site-visit reminders and follow-ups via WhatsApp."
          testId={SETTINGS.toggleWhatsapp}
          checked={!!s.whatsapp_enabled}
          onChange={(v) => set("whatsapp_enabled", v)}
        />
        {s.whatsapp_enabled && (
          <div className="pl-11">
            <div className="label-caps mb-1.5">Business number</div>
            <input value={s.whatsapp_number || ""} onChange={(e) => set("whatsapp_number", e.target.value)} placeholder="+91 90000 00000" className="w-full max-w-md h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
          </div>
        )}

        <Row
          icon={Mail}
          title="Email (Resend)"
          hint="Transactional + drip emails. Add your Resend API key on the server to go live."
          testId={SETTINGS.toggleEmail}
          checked={!!s.email_enabled}
          onChange={(v) => set("email_enabled", v)}
        />
        {s.email_enabled && (
          <div className="pl-11">
            <div className="label-caps mb-1.5">From address</div>
            <input value={s.resend_from_email || ""} onChange={(e) => set("resend_from_email", e.target.value)} placeholder="sales@propzel.com" className="w-full max-w-md h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest" />
          </div>
        )}

        <Row
          icon={CalIcon}
          title="Google Calendar invites for site visits"
          hint="Email a calendar invite for every site visit to the executive, co-owner and customer, from your organisation's email."
          testId={SETTINGS.toggleCalendar}
          checked={!!s.google_calendar_enabled}
          onChange={(v) => set("google_calendar_enabled", v)}
        />
        {s.google_calendar_enabled && <CalendarInviteSettings s={s} set={set} savedKey={savedKey} />}

          <Row
            icon={Zap}
            title="Auto follow-up on missed / no-answer calls"
            hint="If a call is not picked up, Propzel creates a follow-up task on the executive's list automatically."
            testId="settings-toggle-missed-followup"
            checked={!!s.missed_call_followup_enabled}
            onChange={(v) => set("missed_call_followup_enabled", v)}
          />
          {s.missed_call_followup_enabled && (
            <div className="pl-11 mt-3">
              <div className="label-caps mb-1.5">Schedule next call after…</div>
              <Select
                value={String(s.missed_call_followup_hours ?? 24)}
                onValueChange={(v) => set("missed_call_followup_hours", Number(v))}
              >
                <SelectTrigger data-testid="settings-missed-hours" className="w-56 h-10 rounded-sm border-[#E6E4DD]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.25">15 minutes</SelectItem>
                  <SelectItem value="1">1 hour</SelectItem>
                  <SelectItem value="2">2 hours</SelectItem>
                  <SelectItem value="4">4 hours</SelectItem>
                  <SelectItem value="8">8 hours</SelectItem>
                  <SelectItem value="24">1 day (recommended)</SelectItem>
                  <SelectItem value="48">2 days</SelectItem>
                  <SelectItem value="72">3 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
      </section>

      <section className="border border-[#E6E4DD] bg-white rounded-sm p-6 flex items-center gap-3" data-testid="settings-lead-sources-link">
        <Globe className="h-4 w-4 text-forest/60" />
        <div className="flex-1">
          <div className="font-display font-bold text-xl text-forest tracking-tight">Lead capture</div>
          <div className="text-xs text-forest/60 mt-1">Website, Facebook & Instagram, Google Ads, 99acres, MagicBricks, Housing.com and agency APIs are now managed in Lead Sources.</div>
        </div>
        <a href="/lead-sources" className="h-9 px-3 rounded-sm bg-forest text-white text-sm inline-flex items-center">Open Lead Sources</a>
      </section>

      <div className="flex justify-end">
        <button
          data-testid={SETTINGS.saveBtn}
          onClick={save}
          disabled={busy}
          className="h-10 px-5 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function Row({ icon: Icon, title, hint, testId, checked, onChange }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-sm border border-[#E6E4DD] grid place-items-center text-forest/70 shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-forest">{title}</div>
        <div className="text-xs text-forest/60 mt-0.5">{hint}</div>
      </div>
      <Switch data-testid={testId} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
