import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { prettyRange } from "@/components/DashboardRangeBar";
import { PhoneOutgoing, PhoneCall, PhoneMissed, Users2, PhoneIncoming, MessageSquare, Mail, BellRing } from "lucide-react";

const METRICS = [
  ["outgoing_calls", "Outgoing calls", PhoneOutgoing],
  ["answered", "Answered", PhoneCall],
  ["missed", "Missed", PhoneMissed],
  ["unique_contacts", "Unique contacts", Users2],
  ["incoming", "Incoming", PhoneIncoming],
  ["sms_sent", "SMS sent", MessageSquare],
  ["email_sent", "Email sent", Mail],
  ["followups", "Follow-ups", BellRing],
];

export const TeamCallReport = ({ range }) => {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState("all");
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/users").then((r) => setUsers(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    api.get("/dashboard/call-report", { params: { date_from: range.from, date_to: range.to, user_id: userId } }).then((r) => setD(r.data)).catch(() => {});
  }, [range.from, range.to, userId]);
  return (
    <div data-testid="dash-team-call-report" className="border border-[#E6E4DD] bg-white rounded-sm p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps">Team activity · selected period</div>
          <h3 className="font-display font-bold text-2xl text-forest tracking-tight mt-1">Call report</h3>
          <div data-testid="dash-call-report-period" className="text-xs text-forest/60 mt-1">From {prettyRange({ from: range.from, to: range.from })} to {prettyRange({ from: range.to, to: range.to })}</div>
        </div>
        <label className="text-xs text-forest/60">User
          <select data-testid="dash-call-report-user" value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 block h-9 min-w-44 border border-[#E6E4DD] rounded-sm px-2 text-sm text-forest bg-white focus:outline-none focus:border-forest">
            <option value="all">All users</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        {METRICS.map(([k, label, Icon]) => (
          <div key={k} data-testid={`dash-call-report-${k}`} className="border border-[#E6E4DD] rounded-sm p-4">
            <div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-[0.14em] text-forest/55">{label}</div><Icon className="h-3.5 w-3.5 text-forest/40" /></div>
            <div className="font-display font-black text-3xl text-forest tabular-nums mt-2">{d ? d[k] : "–"}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
