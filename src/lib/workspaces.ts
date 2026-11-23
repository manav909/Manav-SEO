/* Simple mode (Manav, 23 Nov 2026): one clear place for each job.
   The app is grouped into a few workspaces, each with one plain sentence of what it is for.
   Every older page still works and stays reachable under "More tools"; nothing is deleted.
   Classic menu: set localStorage "ss.classic" to "1" (there is a switch in More tools). */

export type Tool = { href: string; label: string; what: string; perm: string | null };
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
      { href: "/intake", label: "Lead intake", what: "Paste a lead's website and get a client-ready SEO audit report to send.", perm: "lead_intel" },
      { href: "/wizard", label: "Engagement wizard", what: "From a client brief to research, a full report and a proposal.", perm: null },
      { href: "/deals", label: "Deal workspace", what: "Paste a client chat and get the best reply, the offer and the next step.", perm: "bde_panel" },
      { href: "/team/offers", label: "Offers and orders", what: "Confirm offers and follow every order from start to delivery.", perm: null },
    ] },
  { id: "work", name: "Do the work", sentence: "Plan, run and check the SEO work for every client project.",
    tools: [
      { href: "/workspace", label: "Intelligence workspace", what: "Run the deep research steps for a project and see the findings by pillar.", perm: "playground" },
      { href: "/audit", label: "Site audit", what: "A full SEO audit of a site with clear, ranked fixes.", perm: "audit_tools" },
      { href: "/pm", label: "Project manager", what: "Plan the tasks for a project, run them and verify they are done.", perm: "playground" },
      { href: "/site-manager", label: "Site manager", what: "Manage many pages of a client site at once.", perm: "playground" },
      { href: "/content-writer", label: "Content writer", what: "Write and track the content for each project.", perm: "playground" },
      { href: "/qa-desk", label: "QA desk", what: "Check the delivery before it goes to the client.", perm: "playground" },
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

export function isClassic(): boolean {
  try { return localStorage.getItem("ss.classic") === "1"; } catch { return false; }
}
export function setClassic(on: boolean) {
  try { on ? localStorage.setItem("ss.classic", "1") : localStorage.removeItem("ss.classic"); } catch { /* ignore */ }
}
