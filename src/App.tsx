import React from 'react';
import { Toaster }           from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider }   from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth }     from "@/contexts/AuthContext";
import { ProjectProvider }             from "@/contexts/ProjectContext";
import MissionControl                  from "./pages/MissionControl";
import { DemoProvider }          from "@/contexts/DemoContext";
import { ErrorBoundary }         from "@/components/ErrorBoundary";
import { BrainErrorBoundary }    from "@/components/BrainErrorBoundary";
import ManavBrainAssistant       from "@/components/ManavBrainAssistant";
import HelpOracle                from "@/components/HelpOracle";
import Index          from "./pages/Index";
import DataRoom       from './pages/DataRoom';
import Dashboard      from "./pages/Dashboard";
import Launchpad      from "./pages/Launchpad";
import Audit          from "./pages/Audit";
import Admin          from "./pages/Admin";
import Playground     from './pages/Playground';
import AlgorithmIntel from './pages/AlgorithmIntel';
import SystemControl  from './pages/SystemControl';
import BrainLearning  from './pages/BrainLearning';
import GuestTour      from './pages/GuestTour';
import Desk           from './pages/Desk';
import BrainCommand   from './pages/BrainCommand';
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

function B({ children, name }: { children: React.ReactNode; name: string }) {
  return <BrainErrorBoundary routeName={name}>{children}</BrainErrorBoundary>;
}

const AppRoutes = () => {
  const { authChecked, loading, isApproved } = useAuth();
  if (!authChecked && loading) return <Spinner label="Loading SEO Season..." />;
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/"               element={<B name="index">         <Index />                                          </B>} />
        <Route path="/tour"           element={<B name="tour">          <GuestTour />                                      </B>} />
        <Route path="/admin"          element={<B name="admin">         <Admin />                                          </B>} />

        {/* Protected routes */}
        <Route path="/data-room"      element={<B name="data-room">     <ApprovedRequired><DataRoom /></ApprovedRequired>       </B>} />
        <Route path="/dashboard"      element={<B name="dashboard">     <ApprovedRequired><Dashboard /></ApprovedRequired>     </B>} />
        <Route path="/launchpad"      element={<B name="launchpad">     <ApprovedRequired><Launchpad /></ApprovedRequired>     </B>} />
        <Route path="/audit"          element={<B name="audit">         <ApprovedRequired><Audit /></ApprovedRequired>         </B>} />
        <Route path="/playground"     element={<B name="playground">    <ApprovedRequired><Playground /></ApprovedRequired>    </B>} />
        <Route path="/system-control" element={<B name="system-control"><ApprovedRequired><SystemControl /></ApprovedRequired> </B>} />
        <Route path="/algorithm-intel"element={<B name="algo-intel">    <ApprovedRequired><AlgorithmIntel /></ApprovedRequired></B>} />
        <Route path="/brain-learning" element={<B name="brain-learning"><ApprovedRequired><BrainLearning /></ApprovedRequired> </B>} />
        <Route path="/desk"          element={<B name="desk">         <ApprovedRequired><Desk /></ApprovedRequired>          </B>} />
        <Route path="/brain-command"  element={<B name="brain-command"><ApprovedRequired><BrainCommand /></ApprovedRequired></B>} />
        <Route path="/mission-control" element={<B name="mission-control"><ApprovedRequired><MissionControl /></ApprovedRequired></B>} />
        <Route path="*"               element={<NotFound />} />
      </Routes>

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
