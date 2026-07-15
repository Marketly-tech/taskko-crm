import React, { useEffect, useState } from "react";
import { api, STAGE_META, SOURCE_LABEL, relTime } from "@/lib/api";
import { useProjects } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowUpRight, TrendingUp, CalendarCheck2, BellRing, Users2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { Link } from "react-router-dom";

function KpiCard({ label, value, sub, icon: Icon, tone = "forest" }) {
  return (
    <div className="border border-[#E6E4DD] bg-white rounded-sm p-5 hover:shadow-sm transition-shadow duration-150">
      <div className="flex items-start justify-between">
        <div className="label-caps">{label}</div>
        <Icon className={`h-4 w-4 ${tone === "clay" ? "text-clay" : "text-forest/60"}`} />
      </div>
      <div className="font-display font-black text-4xl text-forest tracking-tight mt-3 leading-none">
        {value}
      </div>
      {sub ? <div className="text-xs text-forest/50 mt-2">{sub}</div> : null}
    </div>
  );
}

export default function Dashboard() {
  const { activeId } = useProjects();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      const q = activeId && activeId !== "__all__" ? { project_id: activeId } : {};
      const { data } = await api.get("/analytics/summary", { params: q });
      setData(data);
      const { data: leads } = await api.get("/leads", { params: q });
      setRecent(leads.slice(0, 6));
    })();
  }, [activeId]);

  if (!data) return <div className="text-forest/60 text-sm">Loading dashboard…</div>;

  const funnelMax = Math.max(...STAGE_META.slice(0, 6).map((s) => data.funnel[s.key] || 0), 1);

  return (
    <div className="space-y-8">
      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total leads" value={data.total_leads} sub="Across current view" icon={Users2} />
        <KpiCard label="Conversion" value={`${data.conversion_rate}%`} sub="Booked / Total" icon={TrendingUp} />
        <KpiCard label="Visits today" value={data.visits_today} sub="Scheduled" icon={CalendarCheck2} />
        <KpiCard label="Pending follow-ups" value={data.followups_pending} sub="Across team" icon={BellRing} tone="clay" />
      </div>

      {/* Trend + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 border border-[#E6E4DD] bg-white rounded-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="label-caps">Leads · Last 7 days</div>
              <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1">
                Inflow trend
              </h3>
            </div>
            <Link to="/leads" className="text-xs uppercase tracking-[0.2em] text-forest hover:text-clay transition-colors duration-150 inline-flex items-center gap-1">
              All leads <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid stroke="#E6E4DD" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5C6661" }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#5C6661" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ border: "1px solid #E6E4DD", borderRadius: 4, fontSize: 12 }} />
                <Line type="monotone" dataKey="leads" stroke="#102A20" strokeWidth={2.5} dot={{ r: 3, fill: "#102A20" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
          <div className="label-caps">Sales funnel</div>
          <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1 mb-5">
            Where they are
          </h3>
          <div className="space-y-3">
            {STAGE_META.slice(0, 6).map((s) => {
              const v = data.funnel[s.key] || 0;
              const pct = (v / funnelMax) * 100;
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium text-forest">{s.label}</div>
                    <div className="text-xs text-forest/60 tabular-nums">{v}</div>
                  </div>
                  <div className="h-2 bg-bone-alt rounded-sm overflow-hidden">
                    <div
                      className="h-full transition-[width] duration-500"
                      style={{ width: `${pct}%`, background: s.tone }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sources + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
          <div className="label-caps">Source mix</div>
          <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1 mb-5">
            Where they came from
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.sources} margin={{ left: 4, right: 4, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#E6E4DD" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="source" tick={{ fontSize: 10, fill: "#5C6661" }} tickFormatter={(v) => (SOURCE_LABEL[v] || v).slice(0, 6)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#5C6661" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ border: "1px solid #E6E4DD", borderRadius: 4, fontSize: 12 }} formatter={(v, _, item) => [v, SOURCE_LABEL[item.payload.source] || item.payload.source]} />
                <Bar dataKey="count" fill="#102A20" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 border border-[#E6E4DD] bg-white rounded-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="label-caps">Latest inflow</div>
              <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1">Recent leads</h3>
            </div>
            <Link to="/leads" className="text-xs uppercase tracking-[0.2em] text-forest hover:text-clay transition-colors duration-150 inline-flex items-center gap-1">
              See kanban <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-[#E6E4DD]">
            {recent.map((l) => {
              const stage = STAGE_META.find((s) => s.key === l.stage);
              return (
                <Link
                  to={`/leads/${l.id}`}
                  key={l.id}
                  className="flex items-center gap-4 py-3 hover:bg-bone-alt/40 rounded-sm px-1 transition-colors duration-150"
                >
                  <div className="h-9 w-9 rounded-sm bg-forest text-white grid place-items-center text-sm font-display font-bold">
                    {(l.name || "?").slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-forest truncate">{l.name}</div>
                    <div className="text-xs text-forest/50">{SOURCE_LABEL[l.source] || l.source} · {relTime(l.created_at)}</div>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-[0.18em] font-bold rounded-sm px-2 py-1"
                    style={{ background: `${stage?.tone}12`, color: stage?.tone }}
                  >
                    {stage?.label || l.stage}
                  </span>
                </Link>
              );
            })}
            {recent.length === 0 && (
              <div className="py-8 text-center text-sm text-forest/50">No leads yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="text-xs text-forest/40">Signed in as {user?.email} · role {user?.role}</div>
    </div>
  );
}
