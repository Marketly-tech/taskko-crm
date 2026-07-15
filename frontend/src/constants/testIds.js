export const AUTH = {
  loginEmail: "auth-login-email",
  loginPassword: "auth-login-password",
  loginSubmit: "auth-login-submit",
  loginError: "auth-login-error",
  logoutBtn: "auth-logout-btn",
};

export const NAV = {
  sidebar: "app-sidebar",
  topbar: "app-topbar",
  projectSwitcher: "topbar-project-switcher",
  notifBell: "topbar-notif-bell",
  notifItem: (id) => `notif-item-${id}`,
  notifMarkAll: "notif-mark-all",
  itemDashboard: "nav-dashboard",
  itemLeads: "nav-leads",
  itemVisits: "nav-visits",
  itemFollowups: "nav-followups",
  itemProjects: "nav-projects",
  itemInventory: "nav-inventory",
  itemReports: "nav-reports",
  itemDataImport: "nav-data-import",
  itemWATemplates: "nav-wa-templates",
  itemBulkAlloc: "nav-bulk-alloc",
  itemPartners: "nav-partners",
  itemProposals: "nav-proposals",
  itemTeam: "nav-team",
  itemSettings: "nav-settings",
};

export const DASH = {
  tabMonth: "dash-tab-month",
  tabActions: "dash-tab-actions",
  kpiNewLeads: "dash-kpi-new-leads",
  kpiRevenue: "dash-kpi-revenue",
  kpiBooked: "dash-kpi-booked",
  kpiConversion: "dash-kpi-conversion",
  kpiMissed: "dash-kpi-missed",
  kpiFollowups: "dash-kpi-followups",
  kpiScheduledCalls: "dash-kpi-scheduled-calls",
  kpiTasks: "dash-kpi-tasks",
  eodCard: "dash-eod-card",
  eodModal: "dash-eod-modal",
  eodSendEmail: "dash-eod-send-email",
  eodDismiss: "dash-eod-dismiss",
};

export const LEADS = {
  toggleView: "leads-toggle-view",
  searchInput: "leads-search-input",
  filterStage: "leads-filter-stage",
  filterSource: "leads-filter-source",
  filterExec: "leads-filter-exec",
  filterProject: "leads-filter-project",
  newLeadBtn: "leads-new-btn",
  createSubmit: "leads-create-submit",
  createName: "leads-create-name",
  createPhone: "leads-create-phone",
  createEmail: "leads-create-email",
  createSource: "leads-create-source",
  createBudget: "leads-create-budget",
  row: (id) => `leads-row-${id}`,
  rowCheckbox: (id) => `leads-row-check-${id}`,
  kanbanCard: (id) => `kanban-card-${id}`,
  kanbanColumn: (stage) => `kanban-col-${stage}`,
  assignBtn: "lead-assign-btn",
  stageBtn: "lead-stage-btn",
  addNoteBtn: "lead-add-note-btn",
  addNoteInput: "lead-note-input",
  addNoteSubmit: "lead-note-submit",
  logCallBtn: "lead-log-call-btn",
  logSmsBtn: "lead-log-sms-btn",
  logEmailBtn: "lead-log-email-btn",
  submitCallBtn: "lead-submit-call-btn",
  submitSmsBtn: "lead-submit-sms-btn",
  submitEmailBtn: "lead-submit-email-btn",
  starBtn: (n) => `lead-star-${n}`,
};

export const PROJECT = {
  newBtn: "project-new-btn",
  submitBtn: "project-submit-btn",
  card: (id) => `project-card-${id}`,
  nameInput: "project-name-input",
  locationInput: "project-location-input",
  priceMinInput: "project-price-min-input",
  priceMaxInput: "project-price-max-input",
};

export const INVENTORY = {
  unitCell: (id) => `unit-cell-${id}`,
  statusFilter: "inventory-status-filter",
};

export const VISIT = {
  newBtn: "visit-new-btn",
  submitBtn: "visit-submit-btn",
  row: (id) => `visit-row-${id}`,
};

export const FOLLOWUP = {
  newBtn: "fu-new-btn",
  submitBtn: "fu-submit-btn",
  row: (id) => `fu-row-${id}`,
  completeBtn: (id) => `fu-complete-${id}`,
};

export const TEAM = {
  newBtn: "team-new-btn",
  submitBtn: "team-submit-btn",
  row: (id) => `team-row-${id}`,
};

export const SETTINGS = {
  saveBtn: "settings-save-btn",
  toggleWhatsapp: "settings-toggle-whatsapp",
  toggleEmail: "settings-toggle-email",
  toggleCalendar: "settings-toggle-calendar",
  toggleAutoAssign: "settings-toggle-autoassign",
  toggleAutoFollowup: "settings-toggle-autofollowup",
};

export const CONSOLE = {
  waNewBtn: "wa-new-btn",
  waSubmitBtn: "wa-submit-btn",
  waRow: (id) => `wa-row-${id}`,
  cpNewBtn: "cp-new-btn",
  cpSubmitBtn: "cp-submit-btn",
  cpRow: (id) => `cp-row-${id}`,
  propNewBtn: "prop-new-btn",
  propSubmitBtn: "prop-submit-btn",
  bulkExec: "bulk-exec-select",
  bulkAssignBtn: "bulk-assign-btn",
  importFile: "import-file",
  importBtn: "import-btn",
};

export const HOME = { emergentLink: "home-emergent-link" };
