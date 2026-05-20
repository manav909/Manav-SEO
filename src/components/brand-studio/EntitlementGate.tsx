/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/EntitlementGate.tsx
   A wrapper that hides or shows Brand Studio content based on
   project entitlements. Used at sub-tab level — the tab nav
   filters itself; this is a safety net for direct tab navigation.

   Renders nothing (or a polite "this feature isn't on your plan"
   message) if the project doesn't have access to the feature.
═══════════════════════════════════════════════════════════════ */

import { Lock } from 'lucide-react';
import type { EntitlementResolution } from './types';

interface Props {
  entitlements: EntitlementResolution | null;
  feature:      string;        /* e.g. 'brand_studio.investor' */
  children:     React.ReactNode;
  /* If true, render a polite locked-out card instead of nothing */
  showLockedState?: boolean;
}

export default function EntitlementGate({ entitlements, feature, children, showLockedState }: Props) {
  /* While entitlements are still loading, render nothing — the parent
     is responsible for showing the loading state at page level. */
  if (!entitlements) return null;

  const enabled = entitlements.features?.[feature] === true;
  if (enabled) return <>{children}</>;

  if (!showLockedState) return null;

  /* Locked state — surfaces only when called with showLockedState (e.g.
     when the user navigates directly to a sub-tab that's not enabled
     for their tier, which shouldn't normally be reachable via UI). */
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
      <Lock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
      <div className="text-sm font-semibold text-foreground">
        This feature isn't included in your current plan
      </div>
      <div className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
        Current tier: <span className="font-mono">{entitlements.tier}</span>.
        Talk to your account manager to enable this feature for this project.
      </div>
    </div>
  );
}
