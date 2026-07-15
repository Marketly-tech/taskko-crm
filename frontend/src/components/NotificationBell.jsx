import React, { useEffect, useState, useCallback } from "react";
import { api, relTime } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { NAV } from "@/constants/testIds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell, BellRing, PhoneMissed, UserPlus, MapPin, TrendingUp,
  Users2, AlertTriangle, CheckCheck,
} from "lucide-react";

const ICONS = {
  lead_assigned: UserPlus,
  followup_due: BellRing,
  sitevisit_reminder: MapPin,
  missed_call: PhoneMissed,
  team_overdue: AlertTriangle,
  stale_lead: TrendingUp,
  negotiation_pending: TrendingUp,
  exec_no_activity: Users2,
};

const TONE = {
  lead_assigned: "bg-forest/10 text-forest",
  followup_due: "bg-clay/10 text-clay",
  sitevisit_reminder: "bg-wheat/20 text-[#8A5A2B]",
  missed_call: "bg-clay/10 text-clay",
  team_overdue: "bg-clay/10 text-clay",
  stale_lead: "bg-forest/10 text-forest",
  negotiation_pending: "bg-forest/10 text-forest",
  exec_no_activity: "bg-forest/10 text-forest",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const nav = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setItems(data.items || []);
      setUnread(data.unread || 0);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const clickItem = async (n) => {
    if (!n.read) {
      try { await api.post(`/notifications/${n.id}/read`); } catch {}
    }
    if (n.link) nav(n.link);
    setOpen(false);
    load();
  };

  const markAll = async () => {
    try { await api.post("/notifications/read-all"); } catch {}
    load();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          data-testid={NAV.notifBell}
          className="relative h-9 w-9 grid place-items-center rounded-sm border border-[#E6E4DD] bg-white text-forest hover:border-forest transition-colors duration-150"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-clay text-white text-[10px] font-bold grid place-items-center tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0 rounded-sm border-[#E6E4DD]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E6E4DD] bg-bone-alt/40">
          <div>
            <div className="font-display font-bold text-forest tracking-tight">Notifications</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-forest/50 mt-0.5">
              {unread} unread
            </div>
          </div>
          {items.length > 0 && (
            <button
              data-testid={NAV.notifMarkAll}
              onClick={markAll}
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] font-bold text-forest/70 hover:text-forest transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-[#E6E4DD]">
          {items.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-forest/50">
              You're all caught up.
            </div>
          )}
          {items.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            const tone = TONE[n.type] || "bg-forest/10 text-forest";
            return (
              <button
                key={n.id}
                data-testid={NAV.notifItem(n.id)}
                onClick={() => clickItem(n)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-bone-alt/40 transition-colors duration-100 ${n.read ? "" : "bg-bone-alt/20"}`}
              >
                <div className={`h-8 w-8 rounded-sm grid place-items-center shrink-0 ${tone}`}>
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={`text-sm ${n.read ? "text-forest/70" : "text-forest font-semibold"} truncate`}>
                      {n.title}
                    </div>
                    {!n.read && <div className="h-1.5 w-1.5 rounded-full bg-clay shrink-0" />}
                  </div>
                  <div className="text-xs text-forest/60 mt-0.5 truncate">{n.message}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-forest/40 mt-1">
                    {relTime(n.created_at)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
