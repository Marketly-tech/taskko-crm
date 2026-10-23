import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const chime = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    });
  } catch { /* audio blocked until user interacts */ }
};

export const LiveLeadAlerts = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    if (!user) return undefined;
    const es = new EventSource(`${process.env.REACT_APP_BACKEND_URL}/api/live/stream`, { withCredentials: true });
    es.addEventListener("lead", (msg) => {
      const ev = JSON.parse(msg.data);
      chime();
      window.dispatchEvent(new CustomEvent("propzel:new-lead", { detail: ev }));
      const repeat = ev.status === "duplicate";
      toast(repeat ? "Repeat enquiry" : "New live lead", {
        description: `${ev.lead?.name || "Lead"} · ${ev.lead?.phone || ""} · ${ev.source_name}`,
        duration: 10000,
        action: { label: "Open", onClick: () => navRef.current(`/leads/${ev.lead_id}`) },
      });
    });
    return () => es.close();
  }, [user]);
  return null;
};
