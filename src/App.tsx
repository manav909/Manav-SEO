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
import BrandStudio                     from "./pages/BrandStudio";
import ClientWorkspace                 from "./pages/ClientWorkspace";
import InviteRedeem                    from "./pages/InviteRedeem";
import Oval                            from "./pages/Oval";
import { DemoProvider }          from "@/contexts/DemoContext";
import { ErrorBoundary }         from "@/components/ErrorBoundary";
import { BrainErrorBoundary }    from "@/components/BrainErrorBoundary";
import ManavBrainAssistant       from "@/components/ManavBrainAssistant";
import HelpOracle                from "@/components/HelpOracle";
import Index          from "./pages/Index";
import DataRoom       from './pages/DataRoom';
import Planning       from './pages/Planning';
import Command        from './pages/Command';
import Dashboard      from "./pages/Dashboard";
import Launchpad      from "./pages/Launchpad";
import Audit          from "./pages/Audit";
import Admin          from "./pages/Admin";
import ClientReportView from "./pages/ClientReportView";
import PMModule       from "./pages/PMModule";
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

// Guards a route by permission key — staff without that perm go to their home page
const StaffGuard = ({ children, perm }: { children: React.ReactNode; perm: string }) => {
  const { user, authChecked, loading, isApproved, staffPermissions } = useAuth();
  if (!authChecked || loading) return <Spinner label="Loading portal..." />;
  if (!user || !isApproved)    return <Navigate to="/" replace />;
  // null staffPermissions = owner/HOD = always allowed
  if (perm === 'hod_only' && staffPermissions) return <Navigate to="/bde-panel" replace />;
  if (staffPermissions && perm !== 'hod_only' && !staffPermissions[perm]) return <Navigate to="/bde-panel" replace />;
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
        <Route path="/admin"          element={<B name="admin">         <Admin />                                          </B>} />
        <Route path="/build"          element={<B name="build">         <Build />                                          </B>} />

        {/* Protected routes */}
        <Route path="/data-room"       element={<B name="data-room">      <StaffGuard perm="data_room">      <DataRoom />       </StaffGuard></B>} />
        <Route path="/planning"        element={<B name="planning">       <StaffGuard perm="data_room">      <Planning />       </StaffGuard></B>} />
        <Route path="/command"         element={<B name="command">        <StaffGuard perm="data_room">      <Command />        </StaffGuard></B>} />
        <Route path="/dashboard"       element={<B name="dashboard">      <StaffGuard perm="dashboard">      <Dashboard />      </StaffGuard></B>} />
        <Route path="/launchpad"       element={<B name="launchpad">      <StaffGuard perm="playground">     <Launchpad />      </StaffGuard></B>} />
        <Route path="/audit"           element={<B name="audit">          <StaffGuard perm="audit_tools">    <Audit />          </StaffGuard></B>} />
        <Route path="/playground"      element={<B name="playground">     <StaffGuard perm="playground">     <Playground />     </StaffGuard></B>} />
        <Route path="/pm"              element={<B name="pm-module">      <StaffGuard perm="playground">     <PMModule />       </StaffGuard></B>} />
        <Route path="/system-control"  element={<B name="system-control"> <StaffGuard perm="system_control"> <SystemControl />  </StaffGuard></B>} />
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
        <Route path="/client-portal" element={<ClientPortal />} />
          <Route path="/revenue-proof" element={<RevenueProof />} />
          <Route path="/scale-control" element={<ScaleControl />} />
          <Route path="/empire" element={<EmpireCommand />} />
          <Route path="/llm-visibility" element={<LLMVisibility />} />
          <Route path="/alerts" element={<AlertCenter />} />
          <Route path="/health" element={<HealthDashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/content-hub" element={<ContentHub />} />
          <Route path="/intake" element={<Intake />} />
          <Route path="/presentation/:token" element={<PresentationView />} />
          <Route path="/client-comms" element={<ClientComms />} />
          <Route path="/profile/:id" element={<StaffProfile />} />
          <Route path="/profile" element={<StaffProfile />} />
          <Route path="/client-dashboard" element={<ClientDashboard />} />
          <Route path="/content-writer" element={<ContentWriter />} />
          <Route path="/themes" element={<ThemePreview />} />
          <Route path="/ask" element={<AskEmpire />} />
          <Route path="/revenue" element={<RevenueBI />} />
          <Route path="/kanban" element={<KanbanBoard />} />
          <Route path="*"               element={<NotFound />} />
      </Routes></div>
        <TourOverlay />
        <AIConcierge />
      </NavProvider></TourProvider></ThemeProvider>

      {/* Manav Brain — only for approved/signed-in users. Guests have ManavBrainGuest on Index. */}
      {isApproved && <ManavBrainAssistant />}
      {isApproved && <HelpOracle />}
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
                <ErrorBoundary>
                  <AppRoutes />
                </ErrorBoundary>
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
