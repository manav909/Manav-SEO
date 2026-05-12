import React from 'react';
import { Toaster }           from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider }   from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary }        from "@/components/ErrorBoundary";
import { BrainErrorBoundary }   from "@/components/BrainErrorBoundary";
import ManavBrainAssistant      from "@/components/ManavBrainAssistant";
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
import Desk           from './pages/Desk';
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

/**
 * Wrap a page in BrainErrorBoundary so crashes on any route are caught,
 * reported to Manav Brain, and shown as a self-healing screen.
 */
function B({ children, name }: { children: React.ReactNode; name: string }) {
  return <BrainErrorBoundary routeName={name}>{children}</BrainErrorBoundary>;
}

const AppRoutes = () => {
  const { authChecked, loading } = useAuth();
  if (!authChecked && loading) return <Spinner label="Loading SEO Season..." />;
  return (
    <>
      <Routes>
        <Route path="/"               element={<B name="index">         <Index />                                           </B>} />
        <Route path="/data-room"      element={<B name="data-room">     <DataRoom />                                        </B>} />
        <Route path="/dashboard"      element={<B name="dashboard">     <ApprovedRequired><Dashboard /></ApprovedRequired>  </B>} />
        <Route path="/launchpad"      element={<B name="launchpad">     <ApprovedRequired><Launchpad /></ApprovedRequired>  </B>} />
        <Route path="/audit"          element={<B name="audit">         <ApprovedRequired><Audit /></ApprovedRequired>      </B>} />
        <Route path="/admin"          element={<B name="admin">         <Admin />                                           </B>} />
        <Route path="/playground"     element={<B name="playground">    <Playground />                                      </B>} />
        <Route path="/system-control" element={<B name="system-control"><SystemControl />                                   </B>} />
        <Route path="/algorithm-intel"element={<B name="algo-intel">    <AlgorithmIntel />                                  </B>} />
        <Route path="/brain-learning" element={<B name="brain-learning"><BrainLearning />                                   </B>} />
        <Route path="/desk"           element={<B name="desk">          <ApprovedRequired><Desk /></ApprovedRequired>           </B>} />
        <Route path="*"               element={<NotFound />} />
      </Routes>

      {/* ◈ Manav Brain — God Mode floating AI, available on every page.
          Monitors all errors, heals the system, controls the entire app. */}
      <ManavBrainAssistant />
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
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
