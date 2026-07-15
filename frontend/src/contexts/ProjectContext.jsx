import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const ProjectCtx = createContext(null);

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(() => localStorage.getItem("tasko.activeProject") || "");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || user === false) return;
    setLoading(true);
    try {
      const { data } = await api.get("/projects");
      setProjects(data);
      if (!data.find((p) => p.id === activeId)) {
        const first = data[0]?.id || "";
        setActiveId(first);
        localStorage.setItem("tasko.activeProject", first);
      }
    } finally {
      setLoading(false);
    }
  }, [user, activeId]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const setActive = (id) => {
    setActiveId(id);
    localStorage.setItem("tasko.activeProject", id || "");
  };

  const active = projects.find((p) => p.id === activeId) || null;

  return (
    <ProjectCtx.Provider value={{ projects, active, activeId, setActive, refresh, loading }}>
      {children}
    </ProjectCtx.Provider>
  );
}

export const useProjects = () => useContext(ProjectCtx);
