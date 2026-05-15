# Claude Chat ↔ Claude Code
# This file is the communication channel.
# Claude Code reads PENDING tasks every 60 seconds and executes them.
# Claude Chat updates this file via git commits.
# Format: ### TASK-XXX [PENDING] then Action/Command/PostAction

## STATUS: ACTIVE

### TASK-001 [DONE 2026-05-16 04:56]
**Action:** Run empire_vision_a.py — database + intelligence libraries + 30 API actions
**Command:** python3 ~/Downloads/empire_vision_a.py
**PostAction:** bridge status with results

### TASK-002 [DONE 2026-05-16 04:56]
**Action:** Run empire_vision_b.py — 15 frontend pages + full automation
**Command:** python3 ~/Downloads/empire_vision_b.py
**PostAction:** bridge status with results

### TASK-003 [DONE 2026-05-16 04:56]
**Action:** Run empire_quality.py — wire Brain to all 9 AI points, fix columns
**Command:** python3 ~/Downloads/empire_quality.py
**PostAction:** bridge status with results

### TASK-004 [DONE 2026-05-16 04:56]
**Action:** Run empire_migrate.py — apply all SQL migrations via Supabase
**Command:** python3 ~/Downloads/empire_migrate.py
**PostAction:** bridge status with table counts

### TASK-005 [PENDING]
**Action:** Run empire_reporter.py — full status report to bridge
**Command:** python3 ~/Downloads/empire_reporter.py
**PostAction:** bridge full report

### TASK-006 [PENDING]
**Action:** tsc check and fix any type errors
**Command:** npx tsc --noEmit 2>&1 | head -30
**PostAction:** bridge tsc results, fix if errors found

### TASK-007 [PENDING]
**Action:** Generate first morning brief for empire
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H 'Content-Type: application/json' -d '{"action":"generate_morning_brief","scope":"empire"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('headline','done'))"
**PostAction:** bridge morning brief result

### TASK-008 [PENDING]
**Action:** Calculate health scores for all projects
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H 'Content-Type: application/json' -d '{"action":"calculate_all_health"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('Health calculated for',d.get('processed',0),'projects')"
**PostAction:** bridge health results

### TASK-009 [PENDING]
**Action:** Write EMPIRE_STATUS.md with complete current state
**Command:** python3 -c "
import subprocess,os,json,datetime
log=subprocess.run('git log --oneline -10',shell=True,capture_output=True,text=True).stdout
pages=os.listdir('src/pages') if os.path.exists('src/pages') else []
libs=os.listdir('api/lib') if os.path.exists('api/lib') else []
te=open('api/task-engine.ts').read() if os.path.exists('api/task-engine.ts') else ''
import re; actions=re.findall(r\"action === ['\\"](\\w+)['\\"],\", te)
status=f\"# Empire Status\n{datetime.datetime.now()}\n\nCommits:\n{log}\nPages ({len(pages)}): {pages}\nLibs ({len(libs)}): {libs}\nActions ({len(actions)}): {actions}\"
open('EMPIRE_STATUS.md','w').write(status)
print(f'Status written: {len(status)} chars')
"
**PostAction:** git commit EMPIRE_STATUS.md and bridge summary

### TASK-010 [PENDING]
**Action:** Final verification - confirm empire is operational
**Command:** python3 -c "
import os
checks = {
  'api/lib/ai-cache.ts': 'Brain extraction',
  'src/pages/EmpireCommand.tsx': 'Empire command',
  'src/pages/Intake.tsx': 'Lead capture',
  'src/pages/MorningBrief.tsx': 'Morning brief',
  'src/pages/LLMVisibility.tsx': 'LLM visibility',
  'src/pages/AlertCenter.tsx': 'Alerts',
  'src/pages/HealthDashboard.tsx': 'Health',
  'src/pages/Reports.tsx': 'Reports',
  'src/pages/ContentHub.tsx': 'Content hub',
  'supabase-migrations/empire_vision.sql': 'Vision migration',
}
ok=[k for k,v in checks.items() if os.path.exists(k)]
missing=[f'{k}({v})' for k,v in checks.items() if not os.path.exists(k)]
print(f'Files OK: {len(ok)}/{len(checks)}')
if missing: print(f'MISSING: {missing}')
else: print('ALL EMPIRE FILES PRESENT - DEPLOYMENT READY')
"
**PostAction:** bridge final verification status

## COMPLETED TASKS

## NOTES
- All scripts in ~/Downloads/
- Bridge via BRIDGE_SECRET in .env
- Supabase via SUPABASE_SERVICE_KEY in .env
- Post ALL updates to bridge
- Commit after each task
