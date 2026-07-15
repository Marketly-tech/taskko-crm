import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api, formatApiError } from "@/lib/api";
import {
  LayoutDashboard, Users2, Building2, BedDouble, CalendarClock, BellRing,
  UserCog, Settings as SettingsIcon, LogOut, BarChart3, UploadCloud,
  MessageSquareText, ShuffleIcon, Handshake, FileText, User,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { NAV, AUTH } from "@/constants/testIds";
import { toast } from "sonner";

const GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard, testId: NAV.itemDashboard, end: true },
      { to: "/leads", label: "Leads", icon: Users2, testId: NAV.itemLeads },
      { to: "/site-visits", label: "Site Visits", icon: CalendarClock, testId: NAV.itemVisits },
      { to: "/follow-ups", label: "Follow-ups", icon: BellRing, testId: NAV.itemFollowups },
    ],
  },
  {
    label: "Project",
    items: [
      { to: "/projects", label: "Project Details", icon: Building2, testId: NAV.itemProjects },
      { to: "/inventory", label: "Inventory", icon: BedDouble, testId: NAV.itemInventory },
    ],
  },
  {
    label: "My Console",
    items: [
      { to: "/reports", label: "Reports", icon: BarChart3, testId: NAV.itemReports },
      { to: "/data-import", label: "Data Import", icon: UploadCloud, testId: NAV.itemDataImport, role: ["admin", "manager"] },
      { to: "/wa-templates", label: "WhatsApp Templates", icon: MessageSquareText, testId: NAV.itemWATemplates },
      { to: "/bulk-allocation", label: "Bulk Lead Allocation", icon: ShuffleIcon, testId: NAV.itemBulkAlloc, role: ["admin", "manager"] },
      { to: "/partners", label: "Channel Partners", icon: Handshake, testId: NAV.itemPartners },
      { to: "/proposals", label: "Proposals", icon: FileText, testId: NAV.itemProposals },
      { to: "/team", label: "Team", icon: UserCog, testId: NAV.itemTeam, role: ["admin"] },
      { to: "/settings", label: "Settings", icon: SettingsIcon, testId: NAV.itemSettings, role: ["admin"] },
    ],
  },
];

export default function Sidebar() {
  const { user, logout, setUser } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [phone, setPhone] = useState(user?.phone || "");

  const saveProfile = async () => {
    try {
      const { data } = await api.patch("/users/me", { phone });
      setUser(data);
      toast.success("Profile updated");
      setProfileOpen(false);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <aside
      data-testid={NAV.sidebar}
      className="grain relative flex flex-col w-[260px] shrink-0 bg-forest text-white min-h-screen"
    >
      <div className="relative z-10 px-6 pt-8 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-sm bg-wheat text-forest grid place-items-center font-display font-black">T</div>
          <div>
            <div className="font-display font-black text-xl tracking-tight leading-none">Tasko</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/50 mt-1">Real Estate CRM</div>
          </div>
        </div>
      </div>

      <nav className="relative z-10 flex-1 px-3 space-y-5 overflow-y-auto pb-6">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.22em] text-white/40">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.filter((i) => !i.role || i.role.includes(user?.role)).map((i) => {
                const Icon = i.icon;
                return (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.end}
                    data-testid={i.testId}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2 text-sm rounded-sm transition-colors duration-150 ${
                        isActive ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/5"
                      }`
                    }
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
                    <span className="font-medium tracking-tight">{i.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative z-10 border-t border-white/10 mx-3 my-3" />

      <div className="relative z-10 px-4 pb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setPhone(user?.phone || ""); setProfileOpen(true); }}
            className="h-9 w-9 rounded-sm bg-white/10 hover:bg-white/20 grid place-items-center text-sm font-display font-bold transition-colors duration-150"
            data-testid="sidebar-profile-btn"
            title="My profile"
          >
            {(user?.name || "?").slice(0, 1).toUpperCase()}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">{user?.role}{user?.phone ? "" : " · set phone"}</div>
          </div>
          <button
            data-testid={AUTH.logoutBtn}
            onClick={logout}
            className="p-1.5 rounded-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-150"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="rounded-sm max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">My profile</DialogTitle>
            <DialogDescription className="text-forest/60">Update your details and mobile number used for Twilio call bridging.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="label-caps mb-1.5">Name</div>
              <div className="text-sm text-forest">{user?.name}</div>
            </div>
            <div>
              <div className="label-caps mb-1.5">Email</div>
              <div className="text-sm text-forest">{user?.email}</div>
            </div>
            <div>
              <div className="label-caps mb-1.5">Phone (E.164 · used for Twilio call bridging)</div>
              <input
                data-testid="profile-phone-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919812345678"
                className="w-full h-10 border border-[#E6E4DD] rounded-sm px-3 text-sm focus:outline-none focus:border-forest"
              />
              <div className="text-[11px] text-forest/50 mt-1">On a Twilio trial account, this number must be verified in your Twilio console for calls to connect.</div>
            </div>
          </div>
          <DialogFooter>
            <button data-testid="profile-save-btn" onClick={saveProfile} className="h-9 px-4 rounded-sm bg-forest text-white text-sm font-medium hover:bg-forest-soft transition-colors duration-150">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
