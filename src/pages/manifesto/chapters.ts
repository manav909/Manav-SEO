/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters.ts
   The fifteen-chapter narrative arc across seven seasons.

   00 Cold Open       → Eternal Spring (the brand reveal)
   01 The Problem     → Winter (cold pain)
   02 The Vision      → Spring (awakening)
   03 How Search Works→ Spring (continuing awakening)
   04 The Five Pillars→ Summer (commitment)
   05 Client Journey  → Summer (continuing commitment)
   06 The Engine Room → Monsoon (work pouring down)
   07 Why This/Not That→ Monsoon (continuing work)
   08 Ethics          → Autumn (careful truth)
   09 Data Doctrine   → Autumn (continuing truth)
   10 For Whom        → Harvest (the yield, named)
   11 Founder Letter  → Harvest (continuing harvest)
   12 Doubts Resolved → Harvest (the reckoning before signing)
   13 In Practice     → Harvest (the work made tangible)
   14 The Future      → Eternal Spring (compounding forward)

   The arc traverses each season twice (except Winter, which is the
   single, painful entry point) — creating a year-shaped journey that
   loops back to its beginning in a different state.
══════════════════════════════════════════════════════════════════════ */

import type { ChapterDef } from './types';

export const CHAPTERS: ChapterDef[] = [
  { id: 'cold-open',   no: '00', season: 'eternal-spring', titleKey: 'ch00' },
  { id: 'problem',     no: '01', season: 'winter',         titleKey: 'ch01' },
  { id: 'vision',      no: '02', season: 'spring',         titleKey: 'ch02' },
  { id: 'how-search',  no: '03', season: 'spring',         titleKey: 'ch03' },
  { id: 'pillars',     no: '04', season: 'summer',         titleKey: 'ch04' },
  { id: 'journey',     no: '05', season: 'summer',         titleKey: 'ch05' },
  { id: 'engine',      no: '06', season: 'monsoon',        titleKey: 'ch06' },
  { id: 'compare',     no: '07', season: 'monsoon',        titleKey: 'ch07' },
  { id: 'ethics',      no: '08', season: 'autumn',         titleKey: 'ch08' },
  { id: 'data',        no: '09', season: 'autumn',         titleKey: 'ch09' },
  { id: 'whom',        no: '10', season: 'harvest',        titleKey: 'ch10' },
  { id: 'founder',     no: '11', season: 'harvest',        titleKey: 'ch11' },
  { id: 'faq',         no: '12', season: 'harvest',        titleKey: 'ch12' },
  { id: 'in-practice', no: '13', season: 'harvest',        titleKey: 'ch13' },
  { id: 'future',      no: '14', season: 'eternal-spring', titleKey: 'ch14' },
];
