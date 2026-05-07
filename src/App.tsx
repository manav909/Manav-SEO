import React from 'react';
import { Toaster }              from "@/components/ui/toaster";
import { Toaster as Sonner }    from "@/components/ui/sonner";
import { TooltipProvider }      from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary }        from "@/components/ErrorBoundary";
import Index     from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Launchpad from "./pages/Launchpad";
import Admin     from "./pages/Admin";
import NotFound  from "./pages/NotFound";

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

/* Only blocks unauthenticated users — no approval check for admin */
const AuthRequired = ({ children }: { children: React.ReactNode }) => {
  const { user, authChecked, loading } = useAuth();
  if (!authChecked || loading) return <Spinner label="Verifying session..." />;
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

/* Blocks unauthenticated + unapproved users */
const ApprovedRequired = ({ children }: { children: React.ReactNode }) => {
  const { user, authChecked, loading, isApproved } = useAuth();
  if (!authChecked || loading) return <Spinner label="Loading portal..." />;
  if (!user) return <Navigate to="/" replace />;
  if (!isApproved) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { authChecked, loading } = useAuth();
  if (!authChecked && loading) return <Spinner label="Loading SEO Season..." />;
  return (
    <Routes>
      <Route path="/"          element={<Index />} />
      <Route path="/dashboard" element={<ApprovedRequired><Dashboard /></ApprovedRequired>} />
      <Route path="/launchpad" element={<ApprovedRequired><Launchpad /></ApprovedRequired>} />
      <Route path="/admin"     element={<Admin />} />
      <Route path="*"          element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster /><Sonner />
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
