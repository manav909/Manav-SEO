/* ════════════════════════════════════════════════════════════════════
   src/pages/manifesto/chapters/ChProblem.tsx
   Chapter 01 — The Problem We Solve. Winter.

   All prose now localized via copy.ts (problem_1, problem_2,
   problem_3_html, problem_statement). The third Prose contains
   <em> tags for inline emphasis, so dangerouslySetInnerHTML is
   used to render the localized HTML safely.
══════════════════════════════════════════════════════════════════════ */

import { ChapterShell, Prose, Statement } from '../shared';
import type { TFn } from '../types';

export function ChProblem({ t }: { t: TFn }) {
  return (
    <ChapterShell id="problem" no="01" season="winter" titleKey="ch01" t={t}>
      <Prose delay={0.4}>{t('problem_1')}</Prose>
      <Prose delay={0.6}>{t('problem_2')}</Prose>
      <Prose delay={0.8}>
        <span dangerouslySetInnerHTML={{ __html: t('problem_3_html') }} />
      </Prose>
      <Statement delay={1.0}>{t('problem_statement')}</Statement>
    </ChapterShell>
  );
}
