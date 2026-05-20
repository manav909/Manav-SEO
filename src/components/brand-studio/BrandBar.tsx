/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/BrandBar.tsx
   The persistent brand context bar shown at the top of every Brand
   Studio sub-tab. Loaded once when the page mounts; visible while
   working in any sub-tab so the PM (or client) always has the brand
   identity in their peripheral vision.

   Shows: logo (if set), client name, primary tagline, color palette
   swatches. Click any swatch to copy its hex. If brand assets are
   empty, shows an "add brand assets" CTA pointing to the Brand tab.
═══════════════════════════════════════════════════════════════ */

import { Palette } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { BrandAssets } from './types';

interface Props {
  projectName?: string;
  assets:       BrandAssets | null;
  loading:      boolean;
  onOpenBrandTab?: () => void;
}

export default function BrandBar({ projectName, assets, loading, onOpenBrandTab }: Props) {
  const hasAnyAssets = !!(
    assets &&
    (assets.primary_logo_url ||
      assets.primary_tagline ||
      (assets.color_palette && assets.color_palette.length > 0))
  );

  const copyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      toast({ title: 'Copied', description: hex });
    } catch { /* clipboard may not be available; silent */ }
  };

  return (
    <div className="rounded-2xl border border-border bg-card/40 backdrop-blur px-4 py-3 flex items-center gap-4 flex-wrap mb-5">
      {/* Logo */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {assets?.primary_logo_url ? (
          <img
            src={assets.primary_logo_url}
            alt={`${projectName || 'Brand'} logo`}
            className="h-9 w-9 rounded-lg object-contain bg-background/60 border border-border shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="h-9 w-9 rounded-lg border border-dashed border-border bg-background/40 flex items-center justify-center shrink-0">
            <Palette className="h-4 w-4 text-muted-foreground/60" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold truncate">{projectName || 'Brand'}</div>
          {assets?.primary_tagline ? (
            <div className="text-xs text-muted-foreground italic truncate">
              "{assets.primary_tagline}"
            </div>
          ) : (
            !loading && (
              <div className="text-[10px] text-muted-foreground/70">
                {hasAnyAssets ? 'Brand assets loaded' : 'No tagline set'}
              </div>
            )
          )}
        </div>
      </div>

      {/* Color swatches */}
      {assets?.color_palette && assets.color_palette.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {assets.color_palette.slice(0, 6).map((c, i) => (
            <button
              key={i}
              onClick={() => copyHex(c.hex)}
              title={`${c.name || c.role || 'Color'} — ${c.hex} (click to copy)`}
              className="h-6 w-6 rounded-full border-2 border-background shadow-sm hover:scale-110 transition-transform"
              style={{ backgroundColor: c.hex }}
            />
          ))}
          {assets.color_palette.length > 6 && (
            <span className="text-[10px] text-muted-foreground">+{assets.color_palette.length - 6}</span>
          )}
        </div>
      )}

      {/* Empty state — gentle CTA to fill brand */}
      {!loading && !hasAnyAssets && onOpenBrandTab && (
        <button
          onClick={onOpenBrandTab}
          className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 font-semibold shrink-0"
        >
          Add brand assets →
        </button>
      )}
    </div>
  );
}
