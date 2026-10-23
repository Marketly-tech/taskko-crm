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
      if (!["__all__", "__none__"].includes(activeId) && !data.find((p) => p.id === activeId)) {
        setActiveId("__all__");
        localStorage.setItem("tasko.activeProject", "__all__");
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
  // API value for the global picker: "" = all projects, "none" = leads without a project
  const projectParam = activeId === "__none__" ? "none" : (activeId && activeId !== "__all__" ? activeId : "");

  return (
    <ProjectCtx.Provider value={{ projects, active, activeId, projectParam, setActive, refresh, loading }}>
      {children}
    </ProjectCtx.Provider>
  );
}

export const useProjects = () => useContext(ProjectCtx);
