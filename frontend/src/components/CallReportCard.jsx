import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { PhoneCall, ArrowUpRight } from "lucide-react";

export const CallReportCard = () => {
  const [d, setD] = useState(null);
  const nav = useNavigate();
  useEffect(() => { api.get("/callerdesk/dashboard").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return null;
  const items = [["Calls today", d.total_calls], ["Connected", d.connected], ["DNP", d.dnp], ["Failed", d.failed], ["Active campaigns", d.active_campaigns]];
  return (
    <button data-testid="dash-call-report-card" onClick={() => nav("/callerdesk/logs")} className="w-full text-left border border-[#E6E4DD] bg-white rounded-sm p-5 hover:border-forest transition-colors duration-150">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><PhoneCall className="h-4 w-4 text-clay" /><div className="label-caps">Business Campaign · today</div></div>
        <ArrowUpRight className="h-4 w-4 text-forest/40" />
      </div>
      <div className="grid grid-cols-5 gap-3 mt-3">
        {items.map(([l, v]) => <div key={l}><div className="font-display font-black text-2xl text-forest tabular-nums">{v ?? 0}</div><div className="text-[10px] uppercase tracking-[0.14em] text-forest/50">{l}</div></div>)}
      </div>
    </button>
  );
};
