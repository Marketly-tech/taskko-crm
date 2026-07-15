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

## MOCKED / deferred integrations
- **WhatsApp** — UI toggles + send buttons present; outbound send is mocked (logs only).
- **Resend Email** — same. UI templates ready; outbound send mocked.
- **Google Calendar** — reminder toggle + ICS-style timestamps captured; no live OAuth yet.
- Live integrations require Resend API key, Twilio SID/Token, Google OAuth client — deferred to v1.1.

## Backlog (P0 → P2)
- P0: Wire Resend + Twilio WhatsApp behind the mock (once keys supplied).
- P0: Google Calendar OAuth + event push for site visits.
- P1: Bulk lead import (CSV/Excel).
- P1: Advanced reports (per-executive scorecards, lost-reason analysis).
- P1: Notification centre (in-app + email digest).
- P2: Mobile app / PWA polish.
- P2: Marketing landing page for Tasko brand.
