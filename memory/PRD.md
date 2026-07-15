# Tasko Real Estate CRM — PRD

## Original problem statement
Build "Tasko", a Paramantra-inspired real estate CRM with lead capture from external portals (MagicBricks, CommonFloor, Google Ads, Meta), auto/manual assignment, role-based access (Admin, Manager, Executive), sales funnel, WhatsApp + Email (Resend), auto follow-ups, project inventory management, site visit management, notifications, Admin EOD summary + email report.

## Core requirements
- React + FastAPI + MongoDB
- JWT (cookie) auth, RBAC (admin/manager/executive)
- Lead webhooks (public) for aggregator portals
- Twilio click-to-call with recordings
- Resend email
- APScheduler (daily 18:00 IST EOD email)

## Implemented so far
- **Iteration 1–4** (prior sessions): Auth+RBAC, Leads (Kanban+List+CRUD+CSV), Projects+Inventory (CSV import/export), Site Visits, Follow-ups, WhatsApp templates, Channel Partners, Proposals, Reports, Dashboard (Month's Updates + Action Items + revenue drill-down), Twilio Voice (executive-first bridged calling + recording + missed-call auto-followup).
- **Iteration 5 (this session)**:
  - In-app notifications collection + endpoints (`GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`, `POST /api/notifications/refresh`).
  - Role-scoped notifications: agents get personal (lead_assigned, followup_due, sitevisit_reminder, missed_call); managers get team aggregates (team_overdue, stale_lead, negotiation_pending, exec_no_activity); admins inherit manager scope.
  - Notification bell in Topbar with unread badge, dropdown, mark-all.
  - Admin EOD summary card in Dashboard's Action Items tab + auto-modal after 18:00 local (per browser).
  - EOD email via Resend HTML template + APScheduler cron (18:00 IST daily).
  - Manual "Send now" button on EOD card + `/api/admin/eod-email/send` endpoint.

## Prioritized backlog (P0/P1/P2)
- P2 · Auto-Dialer (parked)
- P2 · Knowledge base, marketing tools, zone/regions, geolocation dashboard
- P1 · Verify Resend domain (currently testing mode — sends to non-verified admin emails return in errors[])
- P1 · Twilio production keys / lift-off
- P2 · WhatsApp Business API integration (currently template-only)
- P2 · Google Calendar sync for site visits (toggle exists, real integration pending)

## Notes / gotchas
- Resend testing-mode requires `SENDER_EMAIL` to be an address on a verified domain; otherwise the API rejects non-verified recipients. Update `/app/backend/.env` when domain is verified.
- Scheduler is registered in FastAPI startup — restart backend to reload cron.
- EOD modal uses localStorage `tasko-eod-shown-YYYY-MM-DD` to gate once per day.

## Test credentials
See `/app/memory/test_credentials.md`.
