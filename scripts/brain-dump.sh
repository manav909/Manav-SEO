#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# brain-dump.sh — full project snapshot for context handoffs.
#
# Outputs (in order):
#   1. Full file tree (excluding node_modules, .git, .next, dist, build)
#   2. Line count of every api/*.ts Lambda
#   3. Current EMPIRE.md contents
#   4. Last 20 git commits
#   5. Every CREATE TABLE statement across supabase-migrations/
#
# Usage:
#   ./scripts/brain-dump.sh                   # print to stdout
#   ./scripts/brain-dump.sh > snapshot.txt    # save to file
#   ./scripts/brain-dump.sh | pbcopy          # copy to clipboard (macOS)
# ═══════════════════════════════════════════════════════════

set -e

# Always run from repo root regardless of where the script was invoked
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

hr() { printf '\n══════════════════════════════════════════════════════════════════════\n'; }
section() { hr; printf '  %s\n' "$1"; hr; }

# ─── 1. FILE TREE ─────────────────────────────────────────
section "1. FILE TREE"
if command -v tree >/dev/null 2>&1; then
  tree -a -I 'node_modules|.git|.next|dist|build|.DS_Store|.vercel'
else
  # Fallback for systems without `tree` — emulate it with find + sort
  find . \
    -not -path '*/node_modules*' \
    -not -path '*/.git*' \
    -not -path '*/.next*' \
    -not -path '*/dist*' \
    -not -path '*/build*' \
    -not -path '*/.vercel*' \
    -not -name '.DS_Store' \
    | sort \
    | sed -e 's|[^/]*/| |g' -e 's|^ | |'
fi

# ─── 2. API LAMBDA LINE COUNTS ────────────────────────────
section "2. API LAMBDA LINE COUNTS"
if ls api/*.ts >/dev/null 2>&1; then
  wc -l api/*.ts | sort -nr
else
  echo "(no api/*.ts files found)"
fi

# ─── 3. EMPIRE.md ─────────────────────────────────────────
section "3. EMPIRE.md (current state)"
if [ -f EMPIRE.md ]; then
  cat EMPIRE.md
else
  echo "(EMPIRE.md not found — create it at project root)"
fi

# ─── 4. LAST 20 GIT COMMITS ───────────────────────────────
section "4. LAST 20 GIT COMMITS"
if [ -d .git ]; then
  git log --oneline -20 2>&1
else
  echo "(not a git repository)"
fi

# ─── 5. CREATE TABLE STATEMENTS FROM MIGRATIONS ───────────
section "5. CREATE TABLE STATEMENTS (supabase-migrations/)"
if [ -d supabase-migrations ]; then
  for f in supabase-migrations/*.sql; do
    [ -f "$f" ] || continue
    echo
    echo "── $f ──"
    # Extract everything from each CREATE TABLE through its closing ');'
    awk '
      BEGIN { IGNORECASE = 1; inblock = 0 }
      /^[[:space:]]*create[[:space:]]+table/i { inblock = 1 }
      inblock { print }
      inblock && /\);[[:space:]]*$/ { inblock = 0; print "" }
    ' "$f"
  done
else
  echo "(supabase-migrations/ directory not found)"
fi

hr
echo "  Brain dump complete."
hr
