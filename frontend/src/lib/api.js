import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
  timeout: 20000,
});

export const ORG_KEY = "tasko-org-id";
api.interceptors.request.use((config) => {
  const org = localStorage.getItem(ORG_KEY);
  if (org) config.headers["X-Organization-Id"] = org;
  return config;
});

// --- 401 auto-refresh interceptor ---------------------------------------
// If any request returns 401, try /auth/refresh once and replay the original
// request. Only bubble the 401 (and let the app kick to /login) if refresh
// itself fails. Avoids infinite loops with a per-request `_retried` flag.
let refreshInFlight = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const url = original.url || "";
    const skip = url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/auth/logout");
    if (status === 403 && error.response?.data?.detail === "Organisation access denied" && localStorage.getItem(ORG_KEY)) {
      localStorage.removeItem(ORG_KEY);
      window.location.reload();
    }
    if (status !== 401 || original._retried || skip) return Promise.reject(error);
    original._retried = true;
    try {
      refreshInFlight = refreshInFlight || api.post("/auth/refresh");
      await refreshInFlight;
      refreshInFlight = null;
      return api(original);
    } catch (e) {
      refreshInFlight = null;
      return Promise.reject(error);
    }
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function inr(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

export function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Math.abs(diff) < 60) return "just now";
  const mins = diff / 60;
  if (Math.abs(mins) < 60) return `${Math.round(mins)}m ${diff > 0 ? "ago" : "ahead"}`;
  const hrs = mins / 60;
  if (Math.abs(hrs) < 24) return `${Math.round(hrs)}h ${diff > 0 ? "ago" : "ahead"}`;
  const days = hrs / 24;
  if (Math.abs(days) < 30) return `${Math.round(days)}d ${diff > 0 ? "ago" : "ahead"}`;
  return d.toLocaleDateString();
}

export const SOURCE_LABEL = {
  api: "Lead API",
  magicbricks: "MagicBricks",
  "99acres": "99acres",
  commonfloor: "CommonFloor",
  housing: "Housing.com",
  website: "Website",
  google_ads: "Google Ads",
  facebook: "Facebook",
  instagram: "Instagram",
  referral: "Referral",
  walk_in: "Walk-in",
  manual: "Manual",
};

export const STAGE_META = [
  { key: "new", label: "New", tone: "#5C6661" },
  { key: "contacted", label: "Contacted", tone: "#457B9D" },
  { key: "contacted_dnp", label: "Contacted DNP", tone: "#6B7280" },
  { key: "qualified", label: "Qualified", tone: "#2D6A4F" },
  { key: "qualified_dnp", label: "Qualified DNP", tone: "#64748B" },
  { key: "site_visit", label: "Site Visit", tone: "#D4A373" },
  { key: "site_visit_dnp", label: "Site Visit DNP", tone: "#A16207" },
  { key: "negotiation", label: "Negotiation", tone: "#C25934" },
  { key: "negotiation_dnp", label: "Negotiation DNP", tone: "#9A3412" },
  { key: "booked", label: "Booked", tone: "#102A20" },
  { key: "lost", label: "Lost", tone: "#B03A2E" },
];

export const STAGE_LABEL = Object.fromEntries(STAGE_META.map((s) => [s.key, s.label]));
