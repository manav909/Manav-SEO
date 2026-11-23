/* Simple mode (Manav, 23 Nov 2026): one clear place for each job.
   The app is grouped into a few workspaces, each with one plain sentence of what it is for.
   Every older page still works and stays reachable under "More tools"; nothing is deleted.
   Classic menu: set localStorage "ss.classic" to "1" (there is a switch in More tools). */

export type Tool = { href: string; label: string; what: string; perm: string | null; steps?: string[] };
export type Workspace = { id: string; name: string; sentence: string; tools: Tool[] };

export const WORKSPACES: Workspace[] = [
  { id: "today", name: "Today", sentence: "What needs a person today: replies, calls and client messages, in one calm list.",
    tools: [
      { href: "/team/my-day", label: "My day", what: "Everything that needs you today, in order: replies, calls, checks and offers.", perm: null },
      { href: "/team/inbox", label: "Client inbox", what: "Every client conversation in one place, with what is waiting on us.", perm: null },
      { href: "/team/calls", label: "Client calls", what: "Prep before each call, notes during it, and the actions after.", perm: null },
    ] },
  { id: "win", name: "Win clients", sentence: "Turn a lead into a signed client: audit their site, shape the offer, close the deal.",
    tools: [
      { href: "/intake", label: "Lead intake", what: "Paste a lead's website and get a client-ready SEO audit report to send.", perm: "lead_intel" , steps: ["Type the prospect's website and, if you like, their name.", 'Run the check and wait for the audit to finish.', 'Copy the client-ready report and send it to the lead.'] },
      { href: "/wizard", label: "Engagement wizard", what: "From a client brief to research, a full report and a proposal.", perm: null , steps: ['Paste the full client chat or brief.', 'Add the keywords that matter, separated by commas.', 'Choose how deep to go, then build the audit, report and proposal.'] },
      { href: "/deals", label: "Deal workspace", what: "Paste a client chat and get the best reply, the offer and the next step.", perm: "bde_panel" , steps: ['Paste the client chat, or add a call transcript.', 'Read the suggested reply, the offer and the next step.', 'Build the engagement timeline so nothing is missed.'] },
      { href: "/team/offers", label: "Offers and orders", what: "Confirm offers and follow every order from start to delivery.", perm: null },
    ] },
  { id: "work", name: "Do the work", sentence: "Plan, run and check the SEO work for every client project.",
    tools: [
      { href: "/workspace", label: "Intelligence workspace", what: "Run the deep research steps for a project and see the findings by pillar.", perm: "playground" },
      { href: "/audit", label: "Site audit", what: "A full SEO audit of a site with clear, ranked fixes.", perm: "audit_tools" , steps: ['Enter the site address and the company name.', 'Run the audit.', 'Work through the fixes from the top: they are ranked by impact.'] },
      { href: "/pm", label: "Project manager", what: "Plan the tasks for a project, run them and verify they are done.", perm: "playground" },
      { href: "/site-manager", label: "Site manager", what: "Manage many pages of a client site at once.", perm: "playground" , steps: ['Enter the brand name and the site address.', 'Upload the file with the pages to work on.', 'Watch it go page by page; you can stop after the current page at any time.'] },
      { href: "/content-writer", label: "Content writer", what: "Write and track the content for each project.", perm: "playground" , steps: ['Enter a keyword or topic.', 'Generate the brief.', 'Write the piece and track it under the project.'] },
      { href: "/qa-desk", label: "QA desk", what: "Check the delivery before it goes to the client.", perm: "playground" , steps: ['Give the client a short unique handle.', 'Paste what the client said in chat or on a call: it sets what QA checks.', 'Load the work, review it, then download the reviewed workbook.'] },
    ] },
  { id: "clients", name: "Look after clients", sentence: "Show clients their progress and keep every account healthy.",
    tools: [
      { href: "/team/checks", label: "Client checks", what: "Run a site health and AI visibility check for one client.", perm: null },
      { href: "/reports", label: "Reports", what: "Client reports, ready to share.", perm: "data_room" },
      { href: "/client-portal", label: "Client portal", what: "What each client sees when they sign in, and who has access.", perm: null },
      { href: "/health", label: "Client health", what: "Which accounts are at risk, and why.", perm: "dashboard" },
    ] },
  { id: "insights", name: "Insights", sentence: "Know where every project stands and what search and AI engines are doing.",
    tools: [
      { href: "/dashboard", label: "Dashboard", what: "All projects and their key numbers in one view.", perm: "dashboard" },
      { href: "/llm-visibility", label: "AI visibility", what: "Whether ChatGPT, Gemini and Perplexity mention a brand, and for what.", perm: "algorithm_intel" },
      { href: "/algorithm-intel", label: "Algorithm updates", what: "Google updates and best practice, with checklists.", perm: "algorithm_intel" },
      { href: "/vault", label: "Client intelligence", what: "Everything we know about each client and lead, searchable.", perm: "bde_panel" },
    ] },
];

export const inWorkspace = new Set(WORKSPACES.flatMap(w => w.tools.map(t => t.href)));

export function isClassic(): boolean { return getMode() === "classic"; }
export function setClassic(on: boolean) { setMode(on ? "classic" : "simple"); }

/* Advanced mode: the same workspaces plus every other tool, grouped by the job it serves.
   "overlaps" marks tools that do the same job as another one; they are folded into one in the consolidation step. */
export type AdvTool = Tool & { overlaps?: string };
export const ADVANCED_GROUPS: { id: string; name: string; sentence: string; tools: AdvTool[] }[] = [
  { id: "command", name: "Command and overview", sentence: "Owner views of the whole business: every project, every pipeline, every alert.",
    tools: [
      { href: "/oval", label: "The Oval", what: "The owner's strategic suite: competition, priorities and the big picture.", perm: "hod_only" },
      { href: "/empire", label: "Empire command", what: "One view of everything running across the business.", perm: "hod_only", overlaps: "The Oval, Mission control" },
      { href: "/mission-control", label: "Mission control", what: "Every project's pipeline, sortable, with a jump into its plan.", perm: "dashboard" },
      { href: "/morning-brief", label: "Morning brief", what: "The daily briefing of what changed and what matters.", perm: "morning_brief", overlaps: "My day" },
      { href: "/alerts", label: "Alert center", what: "Live alerts across projects.", perm: "staff" },
      { href: "/command", label: "S.E.A.S.O.N. war room", what: "The assistant's two-mode war room with widgets for a project.", perm: "data_room" },
      { href: "/build", label: "Build dashboard", what: "Owner build notes and alerts for the platform itself.", perm: "hod_only" },
    ] },
  { id: "strategy", name: "Strategy and planning", sentence: "Shape each project's strategy and plan before the work starts.",
    tools: [
      { href: "/playground", label: "Canvas", what: "Strategy and execution canvas for a project.", perm: "playground" },
      { href: "/launchpad", label: "Launchpad", what: "A project's launch plan built from its analysis, with estimated value marked clearly.", perm: "playground" },
      { href: "/planning", label: "Planning", what: "Planning view built on the project data room.", perm: "data_room", overlaps: "Project manager" },
      { href: "/kanban", label: "Kanban board", what: "Tasks on a board, from to do to done.", perm: "staff", overlaps: "Project manager" },
      { href: "/brand-studio", label: "Brand studio", what: "A brand's narrative, voice and anchors for all its content.", perm: "dashboard" },
    ] },
  { id: "content", name: "Content", sentence: "Briefs, writing and documents for every project.",
    tools: [
      { href: "/content-hub", label: "Content hub", what: "Content briefs for each project.", perm: "staff", overlaps: "Content writer" },
      { href: "/documents", label: "Documents", what: "Every report and document produced, in one searchable place.", perm: "data_room" },
    ] },
  { id: "clientsplus", name: "Clients, deeper", sentence: "Detailed client views and conversation tools.",
    tools: [
      { href: "/client-dashboard", label: "Client dashboard", what: "A client's numbers as the team sees them.", perm: "dashboard", overlaps: "Client portal" },
      { href: "/client-comms", label: "Client comms", what: "Analyse and answer client conversations.", perm: "bde_panel", overlaps: "Client inbox, Deal workspace" },
      { href: "/bde-panel", label: "BDE panel", what: "Sales team tools: replies, leads with close chances, documents.", perm: "bde_panel", overlaps: "Deal workspace" },
      { href: "/hod", label: "HoD console", what: "How the sales team converts, deal by deal.", perm: "hod_only" },
    ] },
  { id: "brain", name: "Brain and data", sentence: "What the system has learned, and the raw data behind every project.",
    tools: [
      { href: "/ask", label: "Ask the empire", what: "Ask any question about your data in plain words.", perm: "staff" },
      { href: "/brain-command", label: "Brain command", what: "How fast the system is learning.", perm: "brain_learning" },
      { href: "/brain-learning", label: "Brain learning", what: "Review and manage what the system learned from past work.", perm: "brain_learning" },
      { href: "/desk", label: "Brain desk", what: "Everything the brain has produced, searchable and exportable.", perm: "brain_learning", overlaps: "Documents" },
      { href: "/data-room", label: "Data room", what: "All raw data for a project in one place.", perm: "data_room" },
    ] },
  { id: "business", name: "Team and revenue", sentence: "The team, its access, and the money side.",
    tools: [
      { href: "/staff-command", label: "Staff command", what: "The team's work at a glance.", perm: "staff_command" },
      { href: "/admin?tab=staff", label: "Staff and access", what: "Create team logins and set what each person can open.", perm: "staff_command" },
      { href: "/profile", label: "My profile", what: "Your own profile and work.", perm: "staff" },
      { href: "/revenue", label: "Revenue BI", what: "Monthly revenue and pipeline.", perm: "hod_only" },
      { href: "/revenue-proof", label: "Revenue proof", what: "Proof of results to show clients and leads.", perm: "hod_only" },
      { href: "/scale-control", label: "Scale control", what: "What to scale next.", perm: "hod_only" },
    ] },
  { id: "system", name: "System", sentence: "Settings, costs and how the platform runs.",
    tools: [
      { href: "/admin", label: "Admin", what: "All owner settings in one place.", perm: "hod_only" },
      { href: "/season-settings", label: "S.E.A.S.O.N. settings", what: "How the assistant behaves.", perm: "data_room" },
      { href: "/cost-control", label: "Cost control", what: "What the AI and data services cost, and the limits.", perm: "system_control" },
      { href: "/system-control", label: "System control", what: "Platform health and switches.", perm: "system_control" },
      { href: "/themes", label: "Themes", what: "Look and feel.", perm: null },
      { href: "/tour", label: "Guided tour", what: "A walk-through for new team members.", perm: null },
      { href: "/manifesto", label: "Manifesto", what: "What SEO Season stands for.", perm: "staff" },
    ] },
];

export type Mode = "simple" | "advanced" | "classic";
export function getMode(): Mode {
  try { const m = localStorage.getItem("ss.mode"); if (m === "advanced" || m === "classic") return m; if (localStorage.getItem("ss.classic") === "1") return "classic"; } catch { /* ignore */ }
  return "simple";
}
export function setMode(m: Mode) {
  try { localStorage.setItem("ss.mode", m); localStorage.removeItem("ss.classic"); } catch { /* ignore */ }
}
