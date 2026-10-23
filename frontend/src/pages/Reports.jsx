import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError, SOURCE_LABEL, STAGE_META, STAGE_LABEL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportFilters, initialReportFilters } from "@/components/reports/ReportFilters";
import { ReportSection, ReportTable, Metric } from "@/components/reports/ReportTable";
import { ExecScorecard } from "@/components/reports/ExecScorecard";
import { toast } from "sonner";

const AX = { fontSize: 11, fill: "#5C6661" };
const TIP = { border: "1px solid #E6E4DD", borderRadius: 4, fontSize: 12 };
const src = (v) => SOURCE_LABEL[v] || v;
const date = (v) => (v ? new Date(v).toLocaleDateString() : "—");

const COLS = {
  sources: [{ key: "source", label: "Source", render: src }, { key: "total", label: "Leads" }, { key: "active", label: "Active" }, { key: "site_visit", label: "Site visit" }, { key: "booked", label: "Booked" }, { key: "lost", label: "Lost" }, { key: "conversion", label: "Conversion %", render: (v) => `${v}%` }],
  daily: [{ key: "date", label: "Date" }, { key: "outgoing_calls", label: "Calls" }, { key: "answered", label: "Answered" }, { key: "whatsapp_sent", label: "WhatsApp" }, { key: "sms_sent", label: "SMS" }, { key: "email_sent", label: "Email" }, { key: "followups", label: "Follow-ups" }, { key: "site_visits", label: "Visits set" }],
  status: [{ key: "user", label: "Owner" }, { key: "total", label: "Total" }, ...STAGE_META.map((s) => ({ key: s.key, label: s.label }))],
  lost: [{ key: "name", label: "Lead", render: (v, r) => <Link to={`/leads/${r.id}`} className="underline underline-offset-2 hover:text-clay">{v}</Link> }, { key: "phone", label: "Phone" }, { key: "source", label: "Source", render: src }, { key: "stage", label: "Stage", render: (v) => STAGE_LABEL[v] || v }, { key: "reason", label: "Reason" }, { key: "owner", label: "Owner" }, { key: "updated_at", label: "Updated", render: date }],
  calls: [{ key: "lead_name", label: "Lead", render: (v, r) => <Link to={`/leads/${r.lead_id}`} className="underline underline-offset-2">{v}</Link> }, { key: "phone", label: "Phone" }, { key: "user", label: "User" }, { key: "status", label: "Status", render: (v) => String(v || "").replace(/_/g, " ") }, { key: "duration_sec", label: "Sec" }, { key: "created_at", label: "Time", render: (v) => (v ? new Date(v).toLocaleString() : "—") }],
};

export default function Reports() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(initialReportFilters);
  const [users, setUsers] = useState([]);
  const [d, setD] = useState({ summary: null, activity: [], daily: [], status: [], lost: [], reasons: [], sources: [], execs: [] });
  const [busy, setBusy] = useState(false);
  const [calls, setCalls] = useState(null);

  const params = () => {
    const p = { start: filters.start, end: filters.end, date_field: filters.date_field };
    if (filters.source !== "all") p.source = filters.source;
    if (filters.assigned_to !== "all") p.assigned_to = filters.assigned_to;
    return p;
  };
  const load = async () => {
    if (!filters.start || !filters.end) return toast.error("Select a date range first");
    setBusy(true);
    const p = params();
    try {
      const names = ["summary", "activity", "daily", "user-status", "not-interested", "lost-reasons", "sources", "executives"];
      const res = await Promise.all(names.map((n) => api.get(`/reports/${n}`, { params: n === "not-interested" ? { ...p, date_field: "updated" } : p })));
      const [summary, activity, daily, status, lost, reasons, sources, execs] = res.map((r) => r.data);
      setD({ summary, activity, daily, status, lost, reasons, sources, execs });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setBusy(false); }
  };
  const openCalls = async (type) => {
    try {
      const { data } = await api.get("/reports/calls", { params: { ...params(), call_type: type } });
      setCalls({ type, rows: data });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  useEffect(() => { api.get("/users").then((r) => setUsers(r.data)); load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = d.summary?.totals || {}; const a = d.summary?.activity || {};
  const activityCols = [{ key: "user", label: "User" }, { key: "outgoing_calls", label: "Calls" }, { key: "answered", label: "Answered" }, { key: "missed", label: "Missed" }, { key: "unique_contacts", label: "Unique leads" }, { key: "avg_duration_sec", label: "Avg sec" }, { key: "whatsapp_sent", label: "WhatsApp" }, { key: "sms_sent", label: "SMS" }, { key: "emails_sent", label: "Email" }, { key: "followups", label: "Follow-ups" }];

  return (
    <div className="space-y-10" data-testid="reports-page">
      <div>
        <div className="label-caps">Console</div>
        <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Reports</h2>
        <div className="text-sm text-forest/60 mt-1">Lead sources, outreach telemetry, pipeline by owner and lost-lead reasons.</div>
      </div>
      <ReportFilters value={filters} onChange={setFilters} onApply={load} users={users} busy={busy} showUser={user?.role !== "executive"} />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Metric testId="report-kpi-leads" label="Leads" value={t.leads} />
        <Metric testId="report-kpi-booked" label="Booked" value={t.booked} />
        <Metric testId="report-kpi-lost" label="Lost" value={t.lost} />
        <Metric testId="report-kpi-calls" label="Outgoing calls" value={a.outgoing_calls} sub="Tap for list" onClick={() => openCalls("outgoing")} />
        <Metric testId="report-kpi-answered" label="Answered" value={a.outgoing_answered} />
        <Metric testId="report-kpi-missed" label="Missed" value={a.outgoing_missed} sub="Tap for list" onClick={() => openCalls("missed")} />
        <Metric testId="report-kpi-messages" label="WhatsApp / SMS" value={(a.whatsapp_sent || 0) + (a.sms_sent || 0)} sub={`${a.emails_sent || 0} emails`} />
        <Metric testId="report-kpi-followups" label="Follow-ups" value={a.followups} sub={`${a.followups_done || 0} done`} />
      </div>

      <ReportSection testId="report-sources" eyebrow="Source report" title="Lead source performance" csvName="lead-source-performance" rows={d.sources}>
        <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-4">
          <ReportTable columns={COLS.sources} rows={d.sources} testId="report-sources-table" />
          <div className="border border-[#E6E4DD] bg-white rounded-sm p-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.sources}><CartesianGrid stroke="#E6E4DD" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="source" tick={AX} tickFormatter={src} axisLine={false} tickLine={false} /><YAxis tick={AX} allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip contentStyle={TIP} labelFormatter={src} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="total" name="Leads" fill="#102A20" radius={[3, 3, 0, 0]} /><Bar dataKey="booked" name="Booked" fill="#D4A373" radius={[3, 3, 0, 0]} /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </ReportSection>

      <ReportSection testId="report-daily" eyebrow="Daily report" title="Outreach telemetry" csvName="daily-outreach" rows={d.daily}>
        <div className="border border-[#E6E4DD] bg-white rounded-sm p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.daily}><CartesianGrid stroke="#E6E4DD" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={AX} axisLine={false} tickLine={false} minTickGap={24} /><YAxis tick={AX} allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip contentStyle={TIP} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line dataKey="outgoing_calls" name="Calls" stroke="#102A20" dot={false} strokeWidth={2} /><Line dataKey="whatsapp_sent" name="WhatsApp" stroke="#2D6A4F" dot={false} /><Line dataKey="email_sent" name="Email" stroke="#C25934" dot={false} /><Line dataKey="followups" name="Follow-ups" stroke="#D4A373" dot={false} /></LineChart>
          </ResponsiveContainer>
        </div>
        <ReportTable columns={COLS.daily} rows={[...d.daily].reverse()} testId="report-daily-table" />
      </ReportSection>

      <ReportSection testId="report-activity" eyebrow="User-wise report" title="Outreach activity by user" csvName="user-activity" rows={d.activity}>
        <ReportTable columns={activityCols} rows={d.activity} testId="report-activity-table" />
      </ReportSection>

      <ReportSection testId="report-user-status" eyebrow="User vs status" title="Pipeline status by owner" csvName="pipeline-by-owner" rows={d.status}>
        <ReportTable columns={COLS.status} rows={d.status} testId="report-user-status-table" />
      </ReportSection>

      <ReportSection testId="report-not-interested" eyebrow="Not interested report" title="Lost leads with reason" csvName="lost-with-reason" rows={d.lost}>
        <div className="flex flex-wrap gap-2" data-testid="report-lost-reasons">
          {d.reasons.map((r) => <span key={r.reason} className="text-xs border border-[#E6E4DD] bg-white rounded-sm px-2.5 py-1 text-forest">{r.reason} <b className="tabular-nums">{r.count}</b></span>)}
        </div>
        <ReportTable columns={COLS.lost} rows={d.lost} testId="report-not-interested-table" />
      </ReportSection>

      <ReportSection testId="report-execs" eyebrow="Executive scorecard" title="By conversion rate" csvName="executive-scorecard" rows={d.execs}>
        <ExecScorecard execs={d.execs} />
      </ReportSection>

      <Dialog open={!!calls} onOpenChange={(o) => !o && setCalls(null)}>
        <DialogContent className="rounded-sm max-w-5xl">
          <DialogHeader><DialogTitle className="font-display text-2xl">{calls?.type === "missed" ? "Missed calls" : "Outgoing calls"} ({calls?.rows.length || 0})</DialogTitle></DialogHeader>
          <ReportTable columns={COLS.calls} rows={calls?.rows || []} testId="report-calls-table" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
