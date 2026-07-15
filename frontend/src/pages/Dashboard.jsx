import React, { useEffect, useState } from "react";
import { api, STAGE_META, SOURCE_LABEL, inr, relTime } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { DASH } from "@/constants/testIds";
import { Link, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
  Legend, Cell, PieChart, Pie,
} from "recharts";
import StarRating from "@/components/StarRating";
import AdminEODSummary from "@/components/AdminEODSummary";
import {
  TrendingUp, CalendarCheck2, BellRing, Users2, Phone, PhoneMissed,
  CalendarPlus, ListTodo, ArrowUpRight, Sparkles, Building2,
} from "lucide-react";

const PIE_COLORS = ["#102A20", "#C25934", "#D4A373", "#2D6A4F", "#457B9D", "#8A5A2B", "#5C6661", "#B03A2E"];

function Kpi({ label, value, sub, icon: Icon, tone, testId, onClick }) {
  const Cmp = onClick ? "button" : "div";
  return (
    <Cmp
      data-testid={testId}
      onClick={onClick}
      className={`text-left w-full border border-[#E6E4DD] bg-white rounded-sm p-5 transition-all duration-200 ${onClick ? "hover:border-forest hover:shadow-[0_2px_0_0_rgba(16,42,32,0.06)] cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="label-caps">{label}</div>
        <div className={`h-8 w-8 rounded-sm grid place-items-center ${tone === "clay" ? "bg-clay/10 text-clay" : tone === "wheat" ? "bg-wheat/20 text-[#8A5A2B]" : "bg-forest/8 text-forest"}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>
      <div className="font-display font-black text-4xl text-forest tracking-tight mt-3 leading-none tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-forest/50 mt-2">{sub}</div> : null}
    </Cmp>
  );
}

function RevenueBreakdownDialog({ open, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!open) return;
    setData(null);
    api.get("/dashboard/revenue-breakdown").then((r) => setData(r.data));
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-sm max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Revenue breakdown · this month</DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="text-sm text-forest/50 py-8 text-center">Loading…</div>
        ) : (
          <>
            <div className="text-sm text-forest/70">Total accepted revenue: <span className="font-display font-bold text-forest tabular-nums">{inr(data.total)}</span></div>
            <div className="grid md:grid-cols-2 gap-6 mt-2">
              <div className="border border-[#E6E4DD] rounded-sm p-4">
                <div className="label-caps mb-2">By agent</div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.by_agent} dataKey="amount" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                        {data.by_agent.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => inr(v)} contentStyle={{ border: "1px solid #E6E4DD", borderRadius: 4, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 mt-2">
                  {data.by_agent.map((a, i) => (
                    <div key={a.id || i} className="flex items-center justify-between text-xs">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {a.name}
                      </div>
                      <div className="tabular-nums text-forest">{inr(a.amount)} <span className="text-forest/40">· {a.count}</span></div>
                    </div>
                  ))}
                  {data.by_agent.length === 0 && <div className="text-xs text-forest/50">No accepted proposals this month.</div>}
                </div>
              </div>
              <div className="border border-[#E6E4DD] rounded-sm p-4">
                <div className="label-caps mb-2">By project</div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.by_project} dataKey="amount" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                        {data.by_project.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => inr(v)} contentStyle={{ border: "1px solid #E6E4DD", borderRadius: 4, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 mt-2">
                  {data.by_project.map((p, i) => (
                    <Link key={p.id || i} to={p.id ? `/leads?project_id=${p.id}` : "/leads"} className="flex items-center justify-between text-xs hover:text-clay transition-colors duration-150">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {p.name}
                      </div>
                      <div className="tabular-nums text-forest">{inr(p.amount)} <span className="text-forest/40">· {p.count}</span></div>
                    </Link>
                  ))}
                  {data.by_project.length === 0 && <div className="text-xs text-forest/50">No accepted proposals this month.</div>}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MonthlyTab() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [revOpen, setRevOpen] = useState(false);
  useEffect(() => { api.get("/dashboard/monthly").then((r) => setData(r.data)); }, []);
  if (!data) return <div className="text-forest/50 text-sm">Loading…</div>;

  const period = `${new Date(data.period.start).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} – ${new Date(new Date(data.period.end).getTime() - 86400000).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-display font-black text-3xl text-forest tracking-tight">
            Hi, <span className="text-clay">{user?.name?.split(" ")[0]}</span>.
          </div>
          <div className="text-sm text-forest/60 mt-1">Your current month's highlights · {period}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi testId={DASH.kpiNewLeads} label="New leads" value={data.kpi.new_leads} sub="This month · click to view" icon={Users2} onClick={() => nav("/leads?created=this_month")} />
        <Kpi testId={DASH.kpiRevenue} label="Revenue" value={inr(data.kpi.revenue)} sub={`${data.revenue.change_pct >= 0 ? "↑" : "↓"} ${Math.abs(data.revenue.change_pct)}% vs last mo. · click to split`} icon={TrendingUp} tone={data.revenue.change_pct >= 0 ? "wheat" : "clay"} onClick={() => setRevOpen(true)} />
        <Kpi testId={DASH.kpiBooked} label="Booked" value={data.kpi.booked} sub="Deals closed · click to view" icon={CalendarCheck2} onClick={() => nav("/leads?stage=booked")} />
        <Kpi testId={DASH.kpiConversion} label="Conversion" value={`${data.kpi.conversion}%`} sub="Booked / New leads" icon={Sparkles} tone="wheat" onClick={() => nav("/leads?stage=booked")} />
      </div>

      <RevenueBreakdownDialog open={revOpen} onClose={() => setRevOpen(false)} />

      {/* Telemetry + revenue comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 border border-[#E6E4DD] bg-white rounded-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="label-caps">Team activity · last 4 months</div>
              <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1">Outreach telemetry</h3>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <LineChart data={data.telemetry} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid stroke="#E6E4DD" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5C6661" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#5C6661" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ border: "1px solid #E6E4DD", borderRadius: 4, fontSize: 12 }} />
                <Legend iconSize={10} iconType="square" wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                <Line type="monotone" dataKey="outgoing_call" name="Outgoing Call" stroke="#102A20" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="email_sent" name="Email Sent" stroke="#2D6A4F" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="sms_sent" name="SMS Sent" stroke="#D4A373" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="followup_scheduled" name="Follow-Up Scheduled" stroke="#C25934" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-[#E6E4DD] bg-white rounded-sm p-6 flex flex-col">
          <div className="label-caps">Revenue comparison</div>
          <div className="mt-6">
            <div className="text-xs uppercase tracking-[0.18em] text-forest/50">Current month</div>
            <div className="flex items-baseline gap-3 mt-1">
              <div className="font-display font-black text-5xl text-forest tracking-tight">{inr(data.revenue.current)}</div>
              <div className={`text-sm font-semibold ${data.revenue.change_pct >= 0 ? "text-[#2D6A4F]" : "text-clay"}`}>
                {data.revenue.change_pct >= 0 ? "↑" : "↓"} {Math.abs(data.revenue.change_pct)}%
              </div>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-[#E6E4DD]">
            <div className="text-xs uppercase tracking-[0.18em] text-forest/50">Last month</div>
            <div className="font-display font-bold text-3xl text-forest/70 tracking-tight tabular-nums mt-1">{inr(data.revenue.previous)}</div>
          </div>
          <div className="mt-auto pt-6 text-xs text-forest/50">
            Revenue = sum of accepted proposals in the period.
          </div>
        </div>
      </div>

      {/* Pipeline bar */}
      <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
        <div className="label-caps">Total lead pipeline</div>
        <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1 mb-5">Where every lead is</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <BarChart data={data.pipeline} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid stroke="#E6E4DD" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "#5C6661" }} tickFormatter={(v) => STAGE_META.find((s) => s.key === v)?.label || v} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#5C6661" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ border: "1px solid #E6E4DD", borderRadius: 4, fontSize: 12 }} formatter={(v, _n, item) => [v, STAGE_META.find((s) => s.key === item.payload.stage)?.label]} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} onClick={(payload) => payload?.stage && nav(`/leads?stage=${payload.stage}`)} className="cursor-pointer">
                {data.pipeline.map((p, i) => (
                  <Cell key={i} fill={STAGE_META.find((s) => s.key === p.stage)?.tone || "#102A20"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top leads + Recent inquiries + Upcoming closures */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
          <div className="label-caps">Top leads</div>
          <h3 className="font-display font-bold text-xl text-forest tracking-tight mt-1 mb-4">Star ratings</h3>
          <div className="space-y-3">
            {data.top_leads.map((l) => (
              <Link to={`/leads/${l.id}`} key={l.id} className="block hover:bg-bone-alt/40 rounded-sm px-2 py-2 -mx-2 transition-colors duration-150">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-sm bg-forest text-white grid place-items-center text-sm font-display font-bold">{(l.name || "?").slice(0, 1)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-forest text-sm truncate">{l.name}</div>
                    <div className="text-[11px] text-forest/50">Created {new Date(l.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · {STAGE_META.find((s) => s.key === l.stage)?.label}</div>
                  </div>
                  <StarRating value={l.stars || 0} size={13} />
                </div>
              </Link>
            ))}
            {data.top_leads.length === 0 && <div className="text-sm text-forest/50 py-4">Star some leads to see them here.</div>}
          </div>
        </div>

        <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
          <div className="label-caps">Recent inquiries</div>
          <h3 className="font-display font-bold text-xl text-forest tracking-tight mt-1 mb-4">Latest inflow</h3>
          <div className="space-y-3">
            {data.recent_inquiries.map((l) => (
              <Link to={`/leads/${l.id}`} key={l.id} className="block hover:bg-bone-alt/40 rounded-sm px-2 py-2 -mx-2 transition-colors duration-150">
                <div className="text-sm font-medium text-forest">{l.name}</div>
                <div className="text-[11px] text-forest/60 mt-0.5">
                  {relTime(l.created_at)} · <span className="uppercase tracking-[0.12em]">{SOURCE_LABEL[l.source] || l.source}</span>
                </div>
              </Link>
            ))}
            {data.recent_inquiries.length === 0 && <div className="text-sm text-forest/50 py-4">No leads yet.</div>}
          </div>
        </div>

        <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
          <div className="label-caps">Upcoming closures</div>
          <h3 className="font-display font-bold text-xl text-forest tracking-tight mt-1 mb-4">Deals in play</h3>
          <div className="space-y-3">
            {data.upcoming_closures.map((l) => (
              <Link to={`/leads/${l.id}`} key={l.id} className="flex items-center gap-3 hover:bg-bone-alt/40 rounded-sm px-2 py-2 -mx-2 transition-colors duration-150">
                <div className="h-8 w-8 rounded-sm bg-clay/10 text-clay grid place-items-center">
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-forest text-sm truncate">{l.name}</div>
                  <div className="text-[11px] text-forest/60 mt-0.5">Budget {inr(l.budget_min)} · {STAGE_META.find((s) => s.key === l.stage)?.label}</div>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-forest/40" />
              </Link>
            ))}
            {data.upcoming_closures.length === 0 && <div className="text-sm text-forest/50 py-4">Nothing warming up.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionItemsTab() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/dashboard/action-items").then((r) => setData(r.data)); }, []);
  if (!data) return <div className="text-forest/50 text-sm">Loading…</div>;

  const w = data.widgets;
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {user?.role === "admin" && <AdminEODSummary mode="card" />}
      <div className="flex items-baseline gap-3">
        <div className="label-caps">Overview</div>
        <div className="text-sm text-forest/60">· {today} · 12:00 AM – 11:59 PM</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi testId="dash-kpi-missed" label="Missed calls" value={w.missed_calls} sub="Today · click to review" icon={PhoneMissed} tone="clay" onClick={() => nav("/leads")} />
        <Kpi testId="dash-kpi-followups" label="Today's follow-ups" value={w.todays_followups} sub="Scheduled today" icon={BellRing} onClick={() => nav("/follow-ups")} />
        <Kpi testId="dash-kpi-scheduled-calls" label="Scheduled calls" value={w.scheduled_calls} sub="All time" icon={Phone} onClick={() => nav("/follow-ups")} />
        <Kpi testId="dash-kpi-tasks" label="Tasks" value={w.tasks} sub="Meetings / emails / WA" icon={ListTodo} tone="wheat" onClick={() => nav("/follow-ups")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ListPanel
          title="Today's follow-ups"
          empty="No follow-ups today."
          items={data.todays_followups.map((f) => ({
            id: f.id,
            leadId: f.lead_id,
            primary: `${new Date(f.due_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            secondary: f.kind.toUpperCase(),
            note: overdueLabel(f.due_at),
          }))}
        />
        <ListPanel
          title="Planned dates"
          empty="No planned site visits this week."
          items={data.planned_visits.map((v) => ({
            id: v.id,
            leadId: v.lead_id,
            primary: `${new Date(v.scheduled_at).toLocaleDateString([], { day: "2-digit", month: "short" })} · ${new Date(v.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            secondary: "SITE VISIT",
            note: overdueLabel(v.scheduled_at),
          }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeadListPanel title="Leads with no calls done" items={data.no_call_leads} empty="Every lead has been called." />
        <LeadListPanel title="Leads with no follow-up added" items={data.no_followup_leads} empty="Every lead has a follow-up." />
      </div>
    </div>
  );
}

function overdueLabel(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const h = Math.floor(-diff / 3600000);
    const m = Math.floor((-diff / 60000) % 60);
    return { text: `in ${h}h ${m}m`, tone: "forest" };
  }
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff / 60000) % 60);
  return { text: `${h}h ${m}m Overdue`, tone: "clay" };
}

function ListPanel({ title, items, empty }) {
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm">
      <div className="px-5 py-3 border-b border-[#E6E4DD] flex items-center justify-between bg-bone-alt/40">
        <div className="font-display font-bold text-base text-forest tracking-tight">{title}</div>
        <div className="text-xs text-forest/50">{items.length}</div>
      </div>
      <div className="divide-y divide-[#E6E4DD] max-h-[340px] overflow-y-auto">
        {items.map((i) => (
          <Link to={`/leads/${i.leadId}`} key={i.id} className="flex items-center gap-3 px-5 py-3 hover:bg-bone-alt/30 transition-colors duration-100">
            <div className="w-20 shrink-0 text-sm font-display font-bold text-forest tabular-nums">{i.primary}</div>
            <div className="flex-1 min-w-0 text-xs uppercase tracking-[0.15em] font-bold text-forest/60">{i.secondary}</div>
            {i.note && (
              <div className={`text-xs ${i.note.tone === "clay" ? "text-clay font-medium" : "text-forest/50"}`}>{i.note.text}</div>
            )}
          </Link>
        ))}
        {items.length === 0 && <div className="px-5 py-6 text-sm text-forest/50">{empty}</div>}
      </div>
    </div>
  );
}

function LeadListPanel({ title, items, empty }) {
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm">
      <div className="px-5 py-3 border-b border-[#E6E4DD] flex items-center justify-between bg-bone-alt/40">
        <div className="font-display font-bold text-base text-forest tracking-tight">{title}</div>
        <div className="text-xs text-forest/50">{items.length}</div>
      </div>
      <div className="divide-y divide-[#E6E4DD] max-h-[340px] overflow-y-auto">
        {items.map((l) => (
          <Link to={`/leads/${l.id}`} key={l.id} className="flex items-center gap-3 px-5 py-3 hover:bg-bone-alt/30 transition-colors duration-100">
            <div className="h-8 w-8 rounded-sm bg-forest text-white grid place-items-center text-xs font-display font-bold shrink-0">{(l.name || "?").slice(0, 1)}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-forest text-sm truncate">{l.name}</div>
              <div className="text-[11px] text-forest/60 mt-0.5">{SOURCE_LABEL[l.source] || l.source} · {relTime(l.created_at)}</div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-forest/40" />
          </Link>
        ))}
        {items.length === 0 && <div className="px-5 py-6 text-sm text-forest/50">{empty}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState("month");
  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-sm border border-[#E6E4DD] bg-white p-1 h-auto">
          <TabsTrigger data-testid={DASH.tabMonth} value="month" className="rounded-sm data-[state=active]:bg-forest data-[state=active]:text-white text-forest px-4 py-1.5 text-xs uppercase tracking-[0.18em] font-bold">Month's Updates</TabsTrigger>
          <TabsTrigger data-testid={DASH.tabActions} value="actions" className="rounded-sm data-[state=active]:bg-forest data-[state=active]:text-white text-forest px-4 py-1.5 text-xs uppercase tracking-[0.18em] font-bold">Action Items</TabsTrigger>
        </TabsList>
        <TabsContent value="month" className="mt-6"><MonthlyTab /></TabsContent>
        <TabsContent value="actions" className="mt-6"><ActionItemsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
