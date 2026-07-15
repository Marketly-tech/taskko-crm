import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { Toaster } from "@/components/ui/sonner";

import Login from "@/pages/Login";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import Projects from "@/pages/Projects";
import Inventory from "@/pages/Inventory";
import SiteVisits from "@/pages/SiteVisits";
import FollowUps from "@/pages/FollowUps";
import Team from "@/pages/Team";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";
import DataImport from "@/pages/DataImport";
import WhatsAppTemplates from "@/pages/WhatsAppTemplates";
import BulkAllocation from "@/pages/BulkAllocation";
import ChannelPartners from "@/pages/ChannelPartners";
import Proposals from "@/pages/Proposals";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-bone">
        <div className="text-sm text-forest/60 tracking-[0.2em] uppercase">Loading…</div>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <ProjectProvider>
              <AppLayout />
            </ProjectProvider>
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:leadId" element={<LeadDetail />} />
        <Route path="projects" element={<Projects />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="site-visits" element={<SiteVisits />} />
        <Route path="follow-ups" element={<FollowUps />} />
        <Route path="reports" element={<Reports />} />
        <Route path="data-import" element={<DataImport />} />
        <Route path="wa-templates" element={<WhatsAppTemplates />} />
        <Route path="bulk-allocation" element={<BulkAllocation />} />
        <Route path="partners" element={<ChannelPartners />} />
        <Route path="proposals" element={<Proposals />} />
        <Route path="team" element={<Team />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
