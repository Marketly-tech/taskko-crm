export const publicBase = () => window.location.origin;

export const TYPE_META = {
  api: { label: "Universal Lead API", hint: "Any agency, portal, CRM, Zapier/Make or developer can push leads" },
  website: { label: "Website form", hint: "Your own website, landing pages, WordPress / Elementor / Webflow forms" },
  facebook: { label: "Facebook & Instagram Lead Ads", hint: "Instant forms on Meta ads, direct connection to your Page" },
  google_ads: { label: "Google Ads lead form", hint: "Lead form assets on Search, YouTube, Display & Discovery" },
  "99acres": { label: "99acres", hint: "Lead push to Propzel by the 99acres team" },
  magicbricks: { label: "MagicBricks", hint: "Lead push to Propzel by the MagicBricks team" },
  housing: { label: "Housing.com", hint: "Lead push to Propzel by the Housing.com team" },
};

export const FIELDS = [
  ["phone", "Required", "Customer mobile (10-digit or with +91). Also accepted: mobile, phonefax, contact_number"],
  ["name", "Optional", "Full name. Or send first_name / f_name + last_name / l_name"],
  ["email", "Optional", "Customer email"],
  ["project", "Optional", "Project name exactly as in Propzel (sets the project)"],
  ["message", "Optional", "Enquiry text. Also accepted: notes, comments, query, remarks"],
  ["budget / budget_min / budget_max", "Optional", "Numbers in ₹"],
  ["configuration", "Optional", "e.g. 2 BHK. Also accepted: bhk, property_type"],
  ["location", "Optional", "Preferred locality / city"],
  ["subject / campaign", "Optional", "Campaign or ad name for reporting"],
  ["rep_id", "Optional", "Email of a Propzel user to assign the lead to (skips rotation)"],
];

export const urls = (s) => {
  const b = publicBase();
  return {
    api: `${b}/api/v1/leads`,
    keyed: `${b}/api/v1/leads/${s.key}`,
    google: `${b}/api/v1/google-ads/${s.key}`,
    meta: `${b}/api/v1/meta/${s.key}`,
  };
};

const RESPONSES = [
  "201 {\"status\":\"success\",\"lead_id\":\"…\"}  → new lead created",
  "200 {\"status\":\"duplicate\",\"lead_id\":\"…\"} → same phone already exists, new enquiry logged on it",
  "400 → phone missing or invalid   ·   401 → wrong key   ·   403 → source paused in Propzel",
];

const websiteSnippet = (u) => `<form id="propzel-form">
  <input name="name" placeholder="Name" required>
  <input name="phone" placeholder="Mobile" required>
  <input name="email" placeholder="Email">
  <input type="hidden" name="project" value="YOUR PROJECT">
  <textarea name="message" placeholder="Message"></textarea>
  <button>Send</button>
</form>
<script>
document.getElementById("propzel-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await fetch("${u.keyed}", { method: "POST", body: new URLSearchParams(new FormData(e.target)) });
  e.target.reset(); alert("Thank you! We will call you shortly.");
});
</script>`;

// Returns { audience, intro, sections: [{title, lines[] | code}] }
export const buildGuide = (s, org = "our company") => {
  const u = urls(s);
  const fieldLines = FIELDS.map(([f, r, d]) => `${f} (${r}) — ${d}`);
  const common = [
    { title: "Field names we accept", lines: fieldLines },
    { title: "Responses", lines: RESPONSES },
  ];
  const portal = (who) => ({
    audience: `${who} account manager / integration team`,
    intro: `Please enable real-time lead push from ${who} to ${org}'s CRM (Propzel). Every new enquiry on our listings should be sent to the URL below the moment it is received.`,
    sections: [
      { title: "Lead push URL (key is included in the URL)", code: u.keyed },
      { title: "How to send", lines: ["Method: POST (preferred) or GET with query parameters", "Format: JSON, form-urlencoded or XML — all are accepted", "One request per lead, in real time (no daily batches)"] },
      ...common,
      { title: "Please share back with us", lines: [`The ${who} account / listing IDs being connected`, "Confirmation once push is live, so we can verify the first lead", "A test lead (any dummy name + phone) after setup"] },
      { title: "Sample request", code: `curl -X POST "${u.keyed}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Rahul Sharma","phone":"9876543210","email":"rahul@example.com","project":"Skyline Residency","message":"Interested in 2BHK"}'` },
    ],
  });
  const g = {
    api: {
      audience: "Agency / developer / integration partner",
      intro: `Use this API to push leads into ${org}'s CRM (Propzel) in real time. Each lead appears in our CRM within a second.`,
      sections: [
        { title: "Endpoint", code: `POST ${u.api}` },
        { title: "Authentication (use any one)", lines: [`Header  X-API-KEY: ${s.key}`, `HTTP Basic Auth — username and password both = ${s.key}`, `Or put the key in the URL: ${u.keyed}`] },
        { title: "Format", lines: ["JSON, application/x-www-form-urlencoded, multipart or XML", "GET with query parameters is also accepted"] },
        ...common,
        { title: "Sample request", code: `curl -X POST "${u.api}" \\\n  -H "X-API-KEY: ${s.key}" \\\n  -d "f_name=Donald" -d "l_name=Joe" -d "phonefax=9876543210" \\\n  -d "email=donald@example.com" -d "subject=Leads from Google" -d "notes=Interested in 2BHK"` },
        { title: "Please share back with us", lines: ["Which campaigns / channels you will push", "A test lead once connected"] },
      ],
    },
    website: {
      audience: "Website developer / agency",
      intro: `Connect every enquiry form on ${org}'s website to our CRM (Propzel). Leads arrive in the CRM instantly.`,
      sections: [
        { title: "Form submit URL", code: u.keyed },
        { title: "Options", lines: ["Plain HTML: use the snippet below", "WordPress (Contact Form 7, WPForms, Elementor Pro): add a Webhook action pointing to the URL above", "Webflow / Wix / Framer / Unbounce: add a webhook integration to the same URL", "Server-side: POST JSON or form data to the URL"] },
        { title: "HTML snippet", code: websiteSnippet(u) },
        ...common,
      ],
    },
    google_ads: {
      audience: "Google Ads manager / performance agency",
      intro: `Send Google Ads lead form submissions straight into ${org}'s CRM (Propzel).`,
      sections: [
        { title: "Steps", lines: ["Google Ads → Assets → Lead forms → open the form (or create one)", "Scroll to 'Export leads from Google Ads' → 'Other data integration options' → Webhook", "Paste the Webhook URL and Key below", "Click 'Send test data' — a test lead will appear in Propzel instantly", "Save the form"] },
        { title: "Webhook URL", code: u.google },
        { title: "Key", code: s.key },
        { title: "Questions to include in the form", lines: ["Full name, Phone number (required), Email", "Optional custom questions: Project, Budget, Configuration, Location"] },
        { title: "Please share back with us", lines: ["Campaign names connected to this form", "Confirmation once 'Send test data' succeeded"] },
      ],
    },
    facebook: {
      audience: "Meta (Facebook / Instagram) ads manager / agency",
      intro: `Connect Facebook & Instagram Lead Ads (Instant Forms) to ${org}'s CRM (Propzel) so every lead lands within a second.`,
      sections: [
        { title: "Option A — direct connection (recommended)", lines: [
          "1. In developers.facebook.com create (or use) a Business app and add the 'Webhooks' product",
          "2. Webhooks → Page → Subscribe to 'leadgen' with the Callback URL and Verify token below",
          "3. Generate a long-lived Page access token with leads_retrieval, pages_manage_metadata, pages_show_list, pages_read_engagement, ads_management",
          "4. In Meta Business Settings → Integrations → Leads access, allow this app / CRM",
          "5. Send us the Page access token and App secret (or paste them in Propzel → Lead Sources yourself)",
          "6. Test with developers.facebook.com/tools/lead-ads-testing — the lead appears in Propzel instantly",
        ] },
        { title: "Callback URL", code: u.meta },
        { title: "Verify token", code: s.verify_token },
        { title: "Option B — via Zapier / Make / LeadsBridge", lines: [`Trigger: Facebook Lead Ads → New lead`, `Action: Webhook POST to ${u.keyed}`, "Map full_name → name, phone_number → phone, email → email"] },
        { title: "Please share back with us", lines: ["Facebook Page name / ID connected", "Page access token (long-lived) and App secret", "Which forms / campaigns are live"] },
      ],
    },
    "99acres": portal("99acres"),
    magicbricks: portal("MagicBricks"),
    housing: portal("Housing.com"),
  };
  return g[s.type];
};

export const guideToText = (s, guide) => [
  `${s.name} → Propzel CRM integration`,
  `For: ${guide.audience}`,
  "",
  guide.intro,
  ...guide.sections.flatMap((sec) => ["", `## ${sec.title}`, ...(sec.code ? [sec.code] : sec.lines.map((l) => `- ${l}`))]),
].join("\n");
