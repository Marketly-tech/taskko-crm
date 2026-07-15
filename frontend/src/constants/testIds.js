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
  itemDashboard: "nav-dashboard",
  itemLeads: "nav-leads",
  itemProjects: "nav-projects",
  itemInventory: "nav-inventory",
  itemVisits: "nav-visits",
  itemFollowups: "nav-followups",
  itemTeam: "nav-team",
  itemSettings: "nav-settings",
};

export const LEADS = {
  toggleView: "leads-toggle-view",
  searchInput: "leads-search-input",
  filterStage: "leads-filter-stage",
  filterSource: "leads-filter-source",
  newLeadBtn: "leads-new-btn",
  createSubmit: "leads-create-submit",
  createName: "leads-create-name",
  createPhone: "leads-create-phone",
  createEmail: "leads-create-email",
  createSource: "leads-create-source",
  createBudget: "leads-create-budget",
  row: (id) => `leads-row-${id}`,
  kanbanCard: (id) => `kanban-card-${id}`,
  kanbanColumn: (stage) => `kanban-col-${stage}`,
  assignBtn: "lead-assign-btn",
  stageBtn: "lead-stage-btn",
  addNoteBtn: "lead-add-note-btn",
  addNoteInput: "lead-note-input",
  addNoteSubmit: "lead-note-submit",
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

export const HOME = { emergentLink: "home-emergent-link" };
