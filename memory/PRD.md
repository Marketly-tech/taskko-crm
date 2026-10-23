# Propzel (formerly Tasko) Real Estate CRM — PRD

## Original problem statement
Build "Tasko", a Paramantra-inspired real estate CRM with lead capture from external portals (MagicBricks, CommonFloor, Google Ads, Meta), auto/manual assignment, role-based access, sales funnel, WhatsApp + Email (Resend), auto follow-ups, inventory, site visits, notifications, Admin EOD summary + email.
Later request: merge features from the offline repos (CretiveMarketly/taskko-crm-server, PrinceJoshwa/taskko-crm-client): CallerDesk, WhatsApp via Evolution API, number masking, Super Admin (multi-organisation), co-owners, revised lead stages, site-visit calendar, advanced reports.

## User choices (Jun 2026)
- Phased rollout, backend cleanup first.
- Super Admin runs multiple separate organisations and switches between them.
- Phone numbers masked for **Executives AND Managers** (admins + super admin see full).
- CallerDesk / Evolution keys added by the user later (secure card).
- Switch to repo stage list (adds 4 DNP stages); existing leads already matched.

## Architecture
- Backend: FastAPI. `core.py` (config, ScopedDB auto-scoping every tenant collection by active org via contextvar `org_ctx`, auth, masking helpers, models) + `routes/*.py` (auth_users, projects, leads, ops, catalog, dashboard, twilio_voice, notifications, eod, organizations, reports, callerdesk, whatsapp). `server.py` = app, seed, scheduler. Use `raw_db` only for cross-org/auth lookups.
- Super Admin: role `super_admin`, no organization_id; frontend sends `X-Organization-Id` (localStorage `tasko-org-id`); AuthContext normalises super_admin to role admin + `is_super_admin`.
- Public webhooks pick org by `?org=<slug>` (leads, CallerDesk) or path slug + secret (WhatsApp).
- Scheduler jobs wrapped by `for_each_org` (EOD email, notif refresh, CallerDesk campaign tick every minute).

## Implemented
- Iterations 1–7: Auth+RBAC, Leads Kanban/List, Projects/Inventory, Site visits, Follow-ups, WA templates, Partners, Proposals, Reports, Dashboard, Twilio click-to-call+recording, notifications, EOD email (Resend + APScheduler).
- Iteration 8 (Phase 1+2): backend split into modules; multi-org + Super Admin control panel (/super-admin, org create/enable, audit log, org switcher); co-owners (`co_assigned_to`, owner_mode filter, tags, picker, notifications); DNP stages; phone masking (leads, dashboard, activities, users, reports, WhatsApp, CallerDesk logs).
- Iteration 9 (Phase 3+4): Reports page with global date range + presets, source performance, outreach telemetry (daily), activity by user, pipeline status by owner, lost-with-reason (+reason chips), exec scorecard, call drill-down, CSV export; Site-visit calendar view. CallerDesk: dashboard, dialer, campaign dialer (start/pause/cancel, per-minute batching), call logs, settings (provider toggle Twilio/CallerDesk, per-org keys), webhook, call report card on Overview.
- Iteration 10 (Phase 5): WhatsApp via Evolution API — lead WhatsApp section (text, image, sync), WhatsApp Inbox (/whatsapp) with conversations, settings + QR, webhook (messages.upsert), message campaigns (WhatsApp/Email, background delivery with throttle) in CallerDesk.

- Iteration 11 (Jun 2026): Rebrand Tasko → Propzel (UI, titles, EOD email; login emails @tasko.com kept). Overview: one page-level period filter (presets + custom) driving Month's Updates & Action Items; new admin/manager "Team activity · Call report" card (`/api/dashboard/call-report`, user filter); To-do list panel. CallerDesk renamed "Business Campaign" in UI (route /callerdesk kept). Campaign Dialer: stage chips import current stage leads, skip-called-today, auto-start runs CallerDesk batch on create (`/api/callerdesk/campaigns/stage-preview`); campaigns no longer need the provider toggle. WhatsApp template picker in chat composer (inbox + lead). Removed "Calling & recording providers" from Settings.

- Iteration 12 (Jun 2026): **Lead Sources rebuilt** (`routes/lead_sources.py`, page `/lead-sources`). One key per source (api, website, facebook, google_ads, 99acres, magicbricks, housing). Public ingest `/api/v1/leads` (X-API-KEY / Basic / Bearer / ?key) and `/api/v1/leads/{key}` (GET/POST, JSON/form/multipart/XML, Paramantra-compatible fields), `/api/v1/google-ads/{key}`, `/api/v1/meta/{key}` (verify + leadgen → Graph fetch with page token). Duplicate phone (last 10 digits) merges into existing lead (repeat_enquiry activity, enquiry_count). Round-robin per source executives; rep_id override. Live log per source (`lead_events`). Real-time SSE `/api/live/stream` → toast + chime + auto-refresh of Leads (~0.6s). Admin email alert via Resend (needs verified domain). Shareable per-source guide (copy/email/print). Old `/api/webhooks/leads/{source}` removed.

- Iteration 13 (Jun 2026): **Google Calendar invites for site visits** (`routes/calendar_invites.py`). Settings toggle + org sender email/name/visit length + domain status + test invite. On create/reschedule/cancel/delete an .ics (METHOD REQUEST/CANCEL, stable UID, SEQUENCE) is emailed per-recipient to the assigned exec, co-owners and customer from the org's email. Reminder emails at 1d/2h/10m via APScheduler `visit-reminders` (atomic claim). Site Visits agenda shows invite status + resend button. Delivery requires the org's sender domain verified in Resend.

## Status of integrations
- Twilio: live keys set (default calling provider).
- Resend: key set (testing mode – unverified domain).
- CallerDesk: **keys pending** — calls log as `pending_credentials` (mocked). Needs CALLERDESK_AUTHCODE, CALLERDESK_VIRTUAL_NUMBER (+ optional CALLERDESK_WEBHOOK_SECRET); then toggle provider in CallerDesk → Settings.
- Evolution API: **keys pending** — sends return 400 "not connected". Needs EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME; then set the webhook URL shown in Inbox → Settings in Evolution.

## Backlog
- P1 · Verify with real CallerDesk / Evolution keys once provided (webhooks need public BACKEND_PUBLIC_URL).
- P1 · Executive report scope should include co-owned leads.
- P2 · Auto-dialer (predictive), Knowledge base, marketing tools, zones/regions.
- P2 · Store received WhatsApp media in object storage.
- P2 · Mobile-responsive sidebar.
- P1 · Verify propzel.tech domain in Resend + set SENDER_EMAIL so admin lead alerts deliver.
- P2 · Option to hide/clean test leads; require Meta app secret in production.
- P2 · Make EOD / Business Campaign "today" cards follow the page period; shadcn calendar for custom range.
- P2 · Optionally rename seeded login emails to @propzel.com.

## Test credentials
See `/app/memory/test_credentials.md`.
