import React, { useEffect, useState } from "react";
import { api, SOURCE_LABEL } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function Reports() {
  const [execs, setExecs] = useState([]);
  const [sources, setSources] = useState([]);
  useEffect(() => {
    api.get("/reports/executives").then((r) => setExecs(r.data));
    api.get("/reports/sources").then((r) => setSources(r.data));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <div className="label-caps">Console</div>
        <h2 className="font-display font-black text-3xl text-forest tracking-tight mt-1">Reports</h2>
        <div className="text-sm text-forest/60 mt-1">Executive scorecard and lead-source performance.</div>
      </div>

      <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
        <div className="label-caps">Executive scorecard</div>
        <h3 className="font-display font-bold text-xl text-forest tracking-tight mt-1 mb-5">By conversion rate</h3>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {execs.map((e) => (
            <div key={e.id} className="border border-[#E6E4DD] rounded-sm p-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-sm bg-forest text-white grid place-items-center text-sm font-display font-bold">{e.name.slice(0, 1)}</div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-forest truncate">{e.name}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div><div className="font-display font-bold text-lg text-forest tabular-nums">{e.leads}</div><div className="label-caps">Leads</div></div>
                <div><div className="font-display font-bold text-lg text-forest tabular-nums">{e.booked}</div><div className="label-caps">Booked</div></div>
                <div><div className="font-display font-bold text-lg text-forest tabular-nums">{e.site_visits}</div><div className="label-caps">Visits</div></div>
                <div><div className="font-display font-bold text-lg text-forest tabular-nums">{e.pending_followups}</div><div className="label-caps">Pending</div></div>
              </div>
              <div className="mt-3 pt-3 border-t border-[#E6E4DD] flex items-center justify-between">
                <div className="label-caps">Conversion</div>
                <div className="font-display font-bold text-forest tabular-nums">{e.conversion}%</div>
              </div>
            </div>
          ))}
          {execs.length === 0 && <div className="col-span-full text-center text-forest/50 text-sm py-6">Add executives to see their scorecard.</div>}
        </div>
      </div>

      <div className="border border-[#E6E4DD] bg-white rounded-sm p-6">
        <div className="label-caps">Lead-source performance</div>
        <h3 className="font-display font-bold text-xl text-forest tracking-tight mt-1 mb-5">Volume vs conversion</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <BarChart data={sources} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid stroke="#E6E4DD" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="source" tick={{ fontSize: 11, fill: "#5C6661" }} tickFormatter={(v) => SOURCE_LABEL[v] || v} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#5C6661" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ border: "1px solid #E6E4DD", borderRadius: 4, fontSize: 12 }} formatter={(v, n, item) => n === "total" ? [`${v} leads`, "Total"] : [v, n]} labelFormatter={(v) => SOURCE_LABEL[v] || v} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                {sources.map((s, i) => (<Cell key={i} fill="#102A20" />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-6 border border-[#E6E4DD] rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bone-alt/60 border-b border-[#E6E4DD]">
              <tr className="text-[10px] uppercase tracking-[0.15em] text-forest/70">
                <th className="text-left px-4 py-3 font-bold">Source</th>
                <th className="text-left px-4 py-3 font-bold">Total leads</th>
                <th className="text-left px-4 py-3 font-bold">Booked</th>
                <th className="text-left px-4 py-3 font-bold">Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E4DD]">
              {sources.map((s) => (
                <tr key={s.source} className="hover:bg-bone-alt/30 transition-colors duration-100">
                  <td className="px-4 py-3 font-medium text-forest">{SOURCE_LABEL[s.source] || s.source}</td>
                  <td className="px-4 py-3 tabular-nums">{s.total}</td>
                  <td className="px-4 py-3 tabular-nums">{s.booked}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{s.conversion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
