import { SeoEngine } from '@/components/SeoEngine';
import PortalNav from '@/components/PortalNav';
import { useAuth } from '@/contexts/AuthContext';
import { Zap } from 'lucide-react';

export default function Audit() {
  const { clients, projects } = useAuth();
  const client  = clients[0]  || null;
  const project = projects[0] || null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav
        companyName={client?.company ? `${client.company} — SEO Audit Tool` : 'SEO Audit Tool'}
        projects={projects}
        selectedProjectId={project?.id}
      />

      <div className="max-w-5xl mx-auto px-6 py-8">

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold">AI SEO Audit Tool</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Run a live audit on any website. Powered by the same AI framework Manav uses for every client.
          </p>
        </div>

        <SeoEngine />
      </div>
    </div>
  );
}
