import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index     from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Launchpad from "./pages/Launchpad";
import Admin     from "./pages/Admin";
import NotFound  from "./pages/NotFound";

const queryClient = new QueryClient();

/* ── Protected route wrapper ── */
const ProtectedRoute = ({
  children, requireApproved = true,
}: { children: React.ReactNode; requireApproved?: boolean }) => {
  const { user, authChecked, loading, isApproved } = useAuth();

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground font-mono">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (requireApproved && !isApproved) return <Navigate to="/" replace />;

  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, authChecked, loading } = useAuth();

  /* Don't render routes until auth is resolved */
  if (!authChecked && loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground font-mono">Loading SEO Season...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/launchpad" element={
        <ProtectedRoute>
          <Launchpad />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
