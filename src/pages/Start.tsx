/* Start: the home of Simple mode. Each workspace with one sentence of what it is for, and its tools with what each does.
   /start shows every workspace; /start/:ws opens one. */
import { useNavigate, useParams } from "react-router-dom";
import PortalNav from "@/components/PortalNav";
import { useAuth } from "@/contexts/AuthContext";
import { WORKSPACES } from "@/lib/workspaces";

export default function Start() {
  const navigate = useNavigate();
  const { ws } = useParams();
  const { isOwner, staffPermissions } = useAuth() as any;
  const can = (perm: string | null) => isOwner || perm === null || staffPermissions?.[perm] === true;
  const list = ws ? WORKSPACES.filter(w => w.id === ws) : WORKSPACES;
  const one = ws && list.length === 1 ? list[0] : null;

  return (
    <div className="min-h-screen bg-background">
      <PortalNav />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{one ? "Workspace" : "Start here"}</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{one ? one.name : "What do you want to do?"}</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">{one ? one.sentence : "Pick the job. Each workspace holds the few tools for it, and each tool says what it does. Everything else is under More tools."}</p>
        </div>
        <div className={one ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
          {one ? one.tools.filter(t => can(t.perm)).map(t => (
            <button key={t.href} onClick={() => navigate(t.href)}
              className="text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/60 transition-colors">
              <div className="font-semibold">{t.label}</div>
              <div className="text-sm text-muted-foreground mt-1">{t.what}</div>
              <div className="text-xs text-primary font-semibold mt-3">Open</div>
            </button>
          )) : list.map(w => {
            const tools = w.tools.filter(t => can(t.perm));
            if (!tools.length) return null;
            return (
              <section key={w.id} className="rounded-2xl border border-border bg-card p-5 flex flex-col">
                <button onClick={() => navigate("/start/" + w.id)} className="text-left">
                  <h2 className="text-lg font-semibold">{w.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{w.sentence}</p>
                </button>
                <ul className="mt-4 space-y-1">
                  {tools.map(t => (
                    <li key={t.href}>
                      <button onClick={() => navigate(t.href)} className="w-full text-left rounded-xl px-3 py-2 hover:bg-secondary/60 transition-colors">
                        <div className="text-sm font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.what}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
