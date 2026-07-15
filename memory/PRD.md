# Tasko - Real Estate Pre-sales CRM (PRD)

## Problem statement
Build a real-estate CRM inspired by paramantra.com with a superior UI, called **Tasko**.
Auto capture leads from MagicBricks/99acres/CommonFloor/Google Ads/social media,
auto & manual assignment to team, admin/manager/executive RBAC, sales funnel with
WhatsApp + Email nudges (Resend), auto follow-ups on missed calls / scheduled site
visits with Google Calendar + WhatsApp reminders, multi-project toggle, inventory
management (project-wise units), site visit management, plus Paramantra-inspired
features.

## User personas
- **Admin** — org owner: manages team, projects, integrations, sees everything.
- **Manager** — assigns/reassigns leads, monitors funnel, manages inventory.
- **Executive (Sales)** — works assigned leads only, logs calls/visits/notes.

## Core requirements
- JWT (cookie-based) auth with three roles.
- Multi-project workspace with a top-bar project switcher.
- Lead pipeline stages: new → contacted → qualified → site_visit → negotiation → booked / lost.
- Auto lead assignment (least-loaded executive) + manual override.
- Inventory grid per project (tower × floor × unit with status colouring).
- Site visit calendar/list + follow-up task list.
- Activity timeline per lead (auto + manual notes).
- Analytics dashboard (KPIs, funnel, source mix, 7-day trend).
- Public webhook receivers per source for external ingestion.
- Settings screen for integration toggles (WhatsApp / Resend / Google Calendar).

## What's implemented — v1.0 (Feb 2026)
- Backend (FastAPI, single file `server.py`) with all CRUD + analytics + webhooks.
- Seed data: 3 projects, ~130 units, 5 users, ~48 leads across stages, site visits & follow-ups.
- Frontend (React + shadcn) with Login, Dashboard, Leads (list + kanban), Lead detail,
  Projects, Inventory grid, Site Visits, Follow-ups, Team, Settings.
- Custom Tasko design system: forest-green sidebar, warm bone canvas, Cabinet Grotesk + Manrope.

## What's implemented — v1.1 (Feb 2026, iteration 2 – Paramantra parity + Console)
- Dashboard rebuilt with two tabs: **Month's Updates** (KPIs, outreach telemetry line chart with 4 series, revenue vs last month, total-lead pipeline bar chart, Top Leads by stars, Recent Inquiries, Upcoming Closures) and **Action Items** (missed calls / today's follow-ups / scheduled calls / tasks widgets, Today's Follow-ups list with overdue tag, Planned Dates, Leads-with-no-call, Leads-with-no-follow-up).
- Sidebar regrouped into **Workspace / Project / My Console**.
- New Console pages: **Reports** (executive scorecard + source mix), **Data Import** (CSV → leads), **WhatsApp Templates** (approved templates + variables), **Bulk Lead Allocation** (filter + select-many + assign), **Channel Partners** (broker directory), **Proposals** (pipeline by status, drives monthly revenue KPI).
- Leads: added **executive filter** and **project filter** in the filter bar; topbar project switcher is now scoped only to routes it actually affects (Projects/Inventory/Site Visits/Follow-ups) — Leads always shows across projects as requested.
- Lead detail: 5-star **StarRating** widget wired to backend, plus **Log Call / Log SMS / Log Email** dialogs. Call log captures direction / disposition / duration / recording URL. Recording URLs render an inline **audio player + Download link** in the timeline.
- Backend: new endpoints `/api/leads/{id}/log-call|log-sms|log-email`, `/api/leads/bulk-assign`, `/api/leads/import`, `/api/whatsapp-templates/*`, `/api/channel-partners/*`, `/api/proposals/*`, `/api/dashboard/monthly`, `/api/dashboard/action-items`, `/api/reports/executives`, `/api/reports/sources`. New collections: `whatsapp_templates`, `channel_partners`, `proposals`. Seed data extended: 4 templates, 3 partners, ~13 proposals, ~220 synthesized activities so telemetry chart is meaningful.
- Calling API recommendation surfaced in Settings: **Exotel** (recommended India), **MyOperator** (India), **Twilio Voice** (global). All three post recording URLs to Tasko via webhook.

## MOCKED / deferred integrations
- **WhatsApp** — UI toggles + templates ready; outbound send mocked.
- **Resend Email** — same.
- **Google Calendar** — reminder toggle only.
- **Calling providers (Exotel/MyOperator/Twilio)** — recording URL field accepts strings; live webhook receiver is the next wire-up.
- Deferred (per user): Knowledge Base, Marketing Tools, Zone & Region Management, Geolocation Dashboard, Marketing Dashboard.

## Backlog (P0 → P2)
- P0: Wire Resend + Twilio WhatsApp behind the mock (once keys supplied).
- P0: Google Calendar OAuth + event push for site visits.
- P1: Bulk lead import (CSV/Excel).
- P1: Advanced reports (per-executive scorecards, lost-reason analysis).
- P1: Notification centre (in-app + email digest).
- P2: Mobile app / PWA polish.
- P2: Marketing landing page for Tasko brand.
