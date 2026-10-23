import React from "react";

export const ExecScorecard = ({ execs }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" data-testid="report-exec-scorecard">
    {execs.map((e) => (
      <div key={e.id} className="border border-[#E6E4DD] bg-white rounded-sm p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-sm bg-forest text-white grid place-items-center text-sm font-display font-bold">{e.name.slice(0, 1)}</div>
          <div className="text-sm font-medium text-forest truncate">{e.name}</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          {[["Leads", e.leads], ["Booked", e.booked], ["Visits", e.site_visits], ["Pending", e.pending_followups]].map(([l, v]) => (
            <div key={l}><div className="font-display font-bold text-lg text-forest tabular-nums">{v}</div><div className="label-caps">{l}</div></div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-[#E6E4DD] flex items-center justify-between">
          <div className="label-caps">Conversion</div>
          <div className="font-display font-bold text-forest tabular-nums">{e.conversion}%</div>
        </div>
      </div>
    ))}
    {execs.length === 0 && <div className="col-span-full text-center text-forest/50 text-sm py-6">No executives in this period.</div>}
  </div>
);
