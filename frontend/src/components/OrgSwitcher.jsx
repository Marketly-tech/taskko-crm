import React, { useEffect, useState } from "react";
import { api, ORG_KEY } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark } from "lucide-react";

export const switchOrg = (id) => {
  localStorage.setItem(ORG_KEY, id);
  window.location.assign("/");
};

export const OrgSwitcher = () => {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    if (user?.is_super_admin) api.get("/organizations").then((r) => setOrgs(r.data)).catch(() => {});
  }, [user]);

  if (!user?.is_super_admin) return null;
  return (
    <div className="flex items-center gap-2" data-testid="org-switcher">
      <Landmark className="h-4 w-4 text-clay" />
      <Select value={user.active_organization_id || ""} onValueChange={switchOrg}>
        <SelectTrigger data-testid="org-switcher-trigger" className="w-[200px] h-9 rounded-sm border-clay/40 bg-white text-forest">
          <SelectValue placeholder="Select organisation" />
        </SelectTrigger>
        <SelectContent>
          {orgs.map((o) => (
            <SelectItem key={o.id} value={o.id} data-testid={`org-option-${o.slug}`} disabled={o.active === false}>
              {o.name}{o.active === false ? " (disabled)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
