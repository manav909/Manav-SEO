import React from 'react';
import { Toaster }           from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider }   from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import {NavProvider} from "@/contexts/NavContext";
import { TourProvider } from "@/contexts/TourContext";
import TourOverlay from "@/components/TourOverlay";
import AIConcierge from "@/components/AIConcierge";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth }     from "@/contexts/AuthContext";
import { ProjectProvider }             from "@/contexts/ProjectContext";
import MissionControl                  from "./pages/MissionControl";
import CostControl                     from "./pages/CostControl";
import BrandStudio                     from "./pages/BrandStudio";
import ClientWorkspace                 from "./pages/ClientWorkspace";
import InviteRedeem                    from "./pages/InviteRedeem";
import Oval                            from "./pages/Oval";
import { DemoProvider }          from "@/contexts/DemoContext";
import { ErrorBoundary }         from "@/components/ErrorBoundary";
import { BrainErrorBoundary }    from "@/components/BrainErrorBoundary";
import SeasonOrb                 from "@/components/season/SeasonOrb";
import SeasonModal               from "@/components/season/SeasonModal";
import { SeasonProvider }        from "@/contexts/SeasonContext";
import Index          from "./pages/Index";
import DataRoom       from './pages/DataRoom';
import Planning       from './pages/Planning';
import Command        from './pages/Command';
import ClientLens     from './pages/ClientLens';
import ClientShowcase from './pages/ClientShowcase';
import ClientCampaignReport from './pages/ClientCampaignReport';
import Manifesto      from './pages/Manifesto';
import SeasonSettings from './pages/SeasonSettings';
import Dashboard      from "./pages/Dashboard";
import Launchpad      from "./pages/Launchpad";
import Audit          from "./pages/Audit";
import Admin          from "./pages/Admin";
import ClientReportView from "./pages/ClientReportView";
import PMModule       from "./pages/PMModule";
import Workspace      from "./pages/Workspace";
import Wizard         from "./pages/Wizard";
import QaDesk         from "./pages/QaDesk";
import Deals          from "./pages/Deals";
import Hod            from "./pages/Hod";
import Vault          from "./pages/Vault";
import Playground     from './pages/Playground';
import AlgorithmIntel from './pages/AlgorithmIntel';
import SystemControl  from './pages/SystemControl';
import BrainLearning  from './pages/BrainLearning';
import GuestTour      from './pages/GuestTour';
import Desk           from './pages/Desk';
import BrainCommand   from './pages/BrainCommand';
import Build          from './pages/Build';
import ClientPortal from "@/pages/ClientPortal";
import RevenueProof from "@/pages/RevenueProof";
import ScaleControl from "@/pages/ScaleControl";
import EmpireCommand from "@/pages/EmpireCommand";
import MorningBrief from "@/pages/MorningBrief";
import LLMVisibility from "@/pages/LLMVisibility";
import AlertCenter from "@/pages/AlertCenter";
import HealthDashboard from "@/pages/HealthDashboard";
import Reports from "@/pages/Reports";
import Documents from "@/pages/Documents";
import ContentHub from "@/pages/ContentHub";
import Intake from "@/pages/Intake";
import PresentationView from "@/pages/PresentationView";
import ClientComms from "@/pages/ClientComms";
import StaffCommand from "@/pages/StaffCommand";
import BdePanel from "@/pages/BdePanel";
import StaffProfile from "@/pages/StaffProfile";
import ClientDashboard from "@/pages/ClientDashboard";
import ContentWriter from "@/pages/ContentWriter";
import ThemePreview from "@/pages/ThemePreview";
import AskEmpire from "@/pages/AskEmpire";
import RevenueBI from "@/pages/RevenueBI";
import KanbanBoard from "@/pages/KanbanBoard";
import NotFound       from "./pages/NotFound";
import SiteManager    from "@/pages/SiteManager";
import NoAccess       from "@/components/NoAccess";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const Spinner = ({ label = 'Loading...' }: { label?: string }) => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-sm text-muted-foreground font-mono">{label}</p>
    </div>
  </div>
);

const ApprovedRequired = ({ children }: { children: React.ReactNode }) => {
  const { user, authChecked, loading, isApproved } = useAuth();
  if (!authChecked || loading) return <Spinner label="Loading portal..." />;
  if (!user)       return <Navigate to="/" replace />;
  if (!isApproved) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// Guards a route by permission key — staff without that perm go to their home page.
// perm "hod_only" = owners only; perm "staff" = any team member.
const StaffGuard = ({ children, perm }: { children: React.ReactNode; perm: string }) => {
  const { user, authChecked, loading, isApproved, staffPermissions, isStaff, isOwner, accessChecked } = useAuth();
  if (!authChecked || loading) return <Spinner label="Loading portal..." />;
  if (!user || !isApproved)    return <Navigate to="/" replace />;
  if (!accessChecked)          return <Spinner label="Checking access..." />;
  if (!isStaff)                return <NoAccess />;
  if (isOwner || perm === 'staff') return <>{children}</>;
  if (perm === 'hod_only' || !staffPermissions?.[perm]) {
    // bde_panel is the fallback home, so redirecting there would loop
    return perm === 'bde_panel' ? <NoAccess reason="page" /> : <Navigate to="/bde-panel" replace />;
  }
  return <>{children}</>;
};

function B({ children, name }: { children: React.ReactNode; name: string }) {
  return <BrainErrorBoundary routeName={name}>{children}</BrainErrorBoundary>;
}

const AppRoutes = () => {
  const { authChecked, loading, isApproved } = useAuth();
  if (!authChecked && loading) return <Spinner label="Loading SEO Season..." />;
  return (
    <>
      <ThemeProvider><TourProvider><NavProvider>
        <div><Routes>
        {/* Public routes */}
        <Route path="/"               element={<B name="index">         <Index />                                          </B>} />
        <Route path="/tour"           element={<B name="tour">          <GuestTour />                                      </B>} />
        <Route path="/r/:token"       element={<B name="client-report"> <ClientReportView />                              </B>} />
        <Route path="/c/invite/:token" element={<B name="client-invite"> <InviteRedeem />                                  </B>} />
        <Route path="/c/workspace"    element={<B name="client-workspace-session"><ClientWorkspace />                      </B>} />
        <Route path="/c/:token"       element={<B name="client-workspace"><ClientWorkspace />                            </B>} />
        <Route path="/admin"          element={<StaffGuard perm="hod_only"><B name="admin">         <Admin />                                          </B></StaffGuard>} />
        <Route path="/staff"          element={<B name="staff">         <Navigate to="/admin?tab=staff" replace />          </B>} />
        <Route path="/build"          element={<StaffGuard perm="hod_only"><B name="build">         <Build />                                          </B></StaffGuard>} />

        {/* Protected routes */}
        <Route path="/data-room"       element={<B name="data-room">      <StaffGuard perm="data_room">      <DataRoom />       </StaffGuard></B>} />
        <Route path="/planning"        element={<B name="planning">       <StaffGuard perm="data_room">      <Planning />       </StaffGuard></B>} />
        <Route path="/command"         element={<B name="command">        <StaffGuard perm="data_room">      <Command />        </StaffGuard></B>} />
        <Route path="/client/:projectId" element={<B name="client-lens">    <StaffGuard perm="data_room">      <ClientLens />     </StaffGuard></B>} />
        <Route path="/client-lens-v2/:projectId" element={<B name="client-lens-v2"><StaffGuard perm="data_room">      <ClientShowcase /> </StaffGuard></B>} />
        <Route path="/campaign-report/:projectId" element={<B name="campaign-report"><StaffGuard perm="data_room">      <ClientCampaignReport /> </StaffGuard></B>} />
        <Route path="/manifesto"       element={<StaffGuard perm="staff"><B name="manifesto">      <Manifesto />      </B></StaffGuard>} />
        <Route path="/season-settings"  element={<B name="season-settings"><StaffGuard perm="data_room">      <SeasonSettings />  </StaffGuard></B>} />
        <Route path="/dashboard"       element={<B name="dashboard">      <StaffGuard perm="dashboard">      <Dashboard />      </StaffGuard></B>} />
        <Route path="/launchpad"       element={<B name="launchpad">      <StaffGuard perm="playground">     <Launchpad />      </StaffGuard></B>} />
        <Route path="/audit"           element={<B name="audit">          <StaffGuard perm="audit_tools">    <Audit />          </StaffGuard></B>} />
        <Route path="/playground"      element={<B name="playground">     <StaffGuard perm="playground">     <Playground />     </StaffGuard></B>} />
        <Route path="/pm"              element={<B name="pm-module">      <StaffGuard perm="playground">     <PMModule />       </StaffGuard></B>} />
        <Route path="/workspace"       element={<B name="workspace">      <StaffGuard perm="playground">     <Workspace />      </StaffGuard></B>} />
        <Route path="/site-manager"    element={<B name="site-manager">   <StaffGuard perm="playground">     <SiteManager />    </StaffGuard></B>} />
        <Route path="/system-control"  element={<B name="system-control"> <StaffGuard perm="system_control"> <SystemControl />  </StaffGuard></B>} />
        <Route path="/cost-control"     element={<B name="cost-control">   <StaffGuard perm="system_control"> <CostControl />    </StaffGuard></B>} />
        <Route path="/algorithm-intel" element={<B name="algo-intel">     <StaffGuard perm="algorithm_intel"><AlgorithmIntel /> </StaffGuard></B>} />
        <Route path="/brain-learning"  element={<B name="brain-learning"> <StaffGuard perm="brain_learning"> <BrainLearning />  </StaffGuard></B>} />
        <Route path="/desk"            element={<B name="desk">           <StaffGuard perm="brain_learning"> <Desk />           </StaffGuard></B>} />
        <Route path="/brain-command"   element={<B name="brain-command">  <StaffGuard perm="brain_learning"> <BrainCommand />   </StaffGuard></B>} />
        <Route path="/mission-control" element={<B name="mission-control"><StaffGuard perm="dashboard">      <MissionControl /> </StaffGuard></B>} />
        <Route path="/brand-studio"    element={<B name="brand-studio">   <StaffGuard perm="dashboard">      <BrandStudio />    </StaffGuard></B>} />
        <Route path="/oval"            element={<B name="oval">           <StaffGuard perm="hod_only">       <Oval />           </StaffGuard></B>} />
        <Route path="/bde-panel"       element={<B name="bde-panel">      <StaffGuard perm="bde_panel">      <BdePanel />       </StaffGuard></B>} />
        <Route path="/staff-command"   element={<B name="staff-command">  <StaffGuard perm="staff_command">  <StaffCommand />   </StaffGuard></B>} />
        <Route path="/morning-brief"   element={<B name="morning-brief">  <StaffGuard perm="morning_brief">  <MorningBrief />   </StaffGuard></B>} />
        <Route path="/client-portal" element={<StaffGuard perm="staff"><ClientPortal /></StaffGuard>} />
          <Route path="/revenue-proof" element={<StaffGuard perm="hod_only"><RevenueProof /></StaffGuard>} />
          <Route path="/scale-control" element={<StaffGuard perm="hod_only"><ScaleControl /></StaffGuard>} />
          <Route path="/empire" element={<StaffGuard perm="hod_only"><EmpireCommand /></StaffGuard>} />
          <Route path="/llm-visibility" element={<StaffGuard perm="staff"><LLMVisibility /></StaffGuard>} />
          <Route path="/alerts" element={<StaffGuard perm="staff"><AlertCenter /></StaffGuard>} />
          <Route path="/health" element={<StaffGuard perm="staff"><HealthDashboard /></StaffGuard>} />
          <Route path="/reports" element={<StaffGuard perm="staff"><Reports /></StaffGuard>} />
          <Route path="/documents" element={<StaffGuard perm="data_room"><Documents /></StaffGuard>} />
          <Route path="/content-hub" element={<StaffGuard perm="staff"><ContentHub /></StaffGuard>} />
          <Route path="/intake" element={<StaffGuard perm="staff"><Intake /></StaffGuard>} />
          <Route path="/wizard" element={<StaffGuard perm="staff"><B name="wizard"><Wizard /></B></StaffGuard>} />
          <Route path="/qa-desk" element={<StaffGuard perm="staff"><B name="qa-desk"><QaDesk /></B></StaffGuard>} />
          <Route path="/deals" element={<StaffGuard perm="staff"><B name="deals"><Deals /></B></StaffGuard>} />
          <Route path="/hod" element={<StaffGuard perm="hod_only"><B name="hod"><Hod /></B></StaffGuard>} />
          <Route path="/vault" element={<StaffGuard perm="staff"><B name="vault"><Vault /></B></StaffGuard>} />
          <Route path="/presentation/:token" element={<PresentationView />} />
          <Route path="/client-comms" element={<StaffGuard perm="staff"><ClientComms /></StaffGuard>} />
          <Route path="/profile/:id" element={<StaffGuard perm="staff"><StaffProfile /></StaffGuard>} />
          <Route path="/profile" element={<StaffGuard perm="staff"><StaffProfile /></StaffGuard>} />
          <Route path="/client-dashboard" element={<StaffGuard perm="staff"><ClientDashboard /></StaffGuard>} />
          <Route path="/content-writer" element={<StaffGuard perm="staff"><ContentWriter /></StaffGuard>} />
          <Route path="/themes" element={<StaffGuard perm="staff"><ThemePreview /></StaffGuard>} />
          <Route path="/ask" element={<StaffGuard perm="staff"><AskEmpire /></StaffGuard>} />
          <Route path="/revenue" element={<StaffGuard perm="hod_only"><RevenueBI /></StaffGuard>} />
          <Route path="/kanban" element={<StaffGuard perm="staff"><KanbanBoard /></StaffGuard>} />
          <Route path="*"               element={<NotFound />} />
      </Routes></div>
        <TourOverlay />
        <AIConcierge />
      </NavProvider></TourProvider></ThemeProvider>

      {/* Phase 8b — S.E.A.S.O.N. presence on every page (only for approved users) */}
      {isApproved && <SeasonOrb />}
      {isApproved && <SeasonModal />}
    </>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
            <AuthProvider>
              <ProjectProvider>
              <DemoProvider>
                <SeasonProvider>
                <ErrorBoundary>
                  <AppRoutes />
                </ErrorBoundary>
                </SeasonProvider>
              </DemoProvider>
              </ProjectProvider>
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
