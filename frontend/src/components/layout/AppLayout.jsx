import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import AdminEODSummary from "@/components/AdminEODSummary";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bone">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 min-w-0 p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
      <AdminEODSummary mode="modal-controller" />
    </div>
  );
}
