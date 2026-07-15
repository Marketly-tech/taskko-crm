import React from "react";
import { useProjects } from "@/contexts/ProjectContext";
import { NAV } from "@/constants/testIds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Search } from "lucide-react";
import { useLocation } from "react-router-dom";
import NotificationBell from "@/components/NotificationBell";

const TITLES = {
  "/": "Overview",
  "/leads": "Leads",
  "/projects": "Project Details",
  "/inventory": "Inventory",
  "/site-visits": "Site Visits",
  "/follow-ups": "Follow-ups",
  "/team": "Team",
  "/settings": "Settings",
  "/reports": "Reports",
  "/data-import": "Data Import",
  "/wa-templates": "WhatsApp Templates",
  "/bulk-allocation": "Bulk Lead Allocation",
  "/partners": "Channel Partners",
  "/proposals": "Proposals",
};

export default function Topbar() {
  const { projects, activeId, setActive } = useProjects();
  const { pathname } = useLocation();
  const title = TITLES[pathname] || (pathname.startsWith("/leads/") ? "Lead" : "Tasko");
  // Project switcher only appears on pages where it actually filters data.
  const SHOW_ON = new Set(["/projects", "/inventory", "/site-visits", "/follow-ups"]);
  const showSwitcher = SHOW_ON.has(pathname);

  return (
    <header
      data-testid={NAV.topbar}
      className="sticky top-0 z-30 bg-bone/85 backdrop-blur-md border-b border-[#E6E4DD]"
    >
      <div className="flex items-center gap-6 h-16 px-8">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-forest/50">Tasko / Workspace</div>
          <h1 className="font-display font-bold text-xl text-forest tracking-tight leading-none mt-1">
            {title}
          </h1>
        </div>

        <div className="hidden md:flex items-center gap-2 border border-[#E6E4DD] bg-white rounded-sm px-3 h-9 w-72">
          <Search className="h-4 w-4 text-forest/50" />
          <input
            placeholder="Search leads, projects, units…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-forest/40"
            data-testid="topbar-search"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 border border-[#E6E4DD] text-forest/50 rounded-sm">⌘K</kbd>
        </div>

        <div className="flex items-center gap-2">
          {showSwitcher && (
            <>
              <Building2 className="h-4 w-4 text-forest/60" />
              <Select value={activeId || ""} onValueChange={(v) => setActive(v)}>
                <SelectTrigger
                  data-testid={NAV.projectSwitcher}
                  className="w-[220px] h-9 rounded-sm border-[#E6E4DD] bg-white text-forest data-[placeholder]:text-forest/50"
                >
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} data-testid={`project-option-${p.id}`}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
