# Claude Chat ↔ Claude Code Communication
# Poller reads PENDING tasks every 60s
# Claude Chat updates via new task scripts
# STATUS: ACTIVE

### TASK-001 [PENDING]
**Action:** Run empire_vision_a.py — 10 tables + 6 libs + 30 actions
**Command:** python3 ~/Downloads/empire_vision_a.py
**PostAction:** bridge results

### TASK-002 [PENDING]
**Action:** Run empire_vision_b.py — 15 pages + automation
**Command:** python3 ~/Downloads/empire_vision_b.py
**PostAction:** bridge results

### TASK-003 [PENDING]
**Action:** Run empire_quality.py — Brain wired to all 9 AI points
**Command:** python3 ~/Downloads/empire_quality.py
**PostAction:** bridge results

### TASK-004 [PENDING]
**Action:** Apply SQL migrations via psycopg2 or pgmeta
**Command:** python3 ~/Downloads/empire_migrate.py
**PostAction:** bridge table counts

### TASK-005 [PENDING]
**Action:** TypeScript check — fix any errors
**Command:** npx tsc --noEmit 2>&1 | head -20
**PostAction:** bridge tsc output, fix if errors

### TASK-006 [PENDING]
**Action:** Full status report to bridge
**Command:** python3 ~/Downloads/empire_reporter.py
**PostAction:** bridge full report

### TASK-007 [PENDING]
**Action:** Generate morning brief
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H "Content-Type: application/json" -d "{"action":"generate_morning_brief","scope":"empire"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('headline','done'))"
**PostAction:** bridge result

### TASK-008 [PENDING]
**Action:** Calculate all client health scores
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H "Content-Type: application/json" -d "{"action":"calculate_all_health"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('done:',d.get('processed',0),'projects')"
**PostAction:** bridge result

### TASK-009 [PENDING]
**Action:** Write comprehensive EMPIRE_STATUS.md
**Command:** python3 -c "
import os,re,subprocess,datetime
_,log=subprocess.run('git log --oneline -10',shell=True,capture_output=True,text=True).stdout,None;_,log=subprocess.run('git log --oneline -10',shell=True,capture_output=True,text=True)
pages=len([f for f in os.listdir('src/pages') if f.endswith('.tsx')]) if os.path.exists('src/pages') else 0
libs=len([f for f in os.listdir('api/lib') if f.endswith('.ts')]) if os.path.exists('api/lib') else 0
te=open('api/task-engine.ts').read() if os.path.exists('api/task-engine.ts') else ''
actions=len(re.findall(r\"action === \",te))
s=f'# Empire Status {datetime.datetime.now()}

Commits:
{log.stdout}
Pages: {pages}
Libs: {libs}
Actions: {actions}
'
open('EMPIRE_STATUS.md','w').write(s)
print(f'Status: {pages} pages, {libs} libs, {actions} actions')
"
**PostAction:** git commit and bridge summary

### TASK-010 [PENDING]
**Action:** Final check — all empire files present
**Command:** python3 -c "
import os
files={'api/lib/ai-cache.ts':'Brain','src/pages/EmpireCommand.tsx':'Empire','src/pages/Intake.tsx':'Intake','src/pages/MorningBrief.tsx':'Brief','src/pages/LLMVisibility.tsx':'LLM','src/pages/AlertCenter.tsx':'Alerts','src/pages/HealthDashboard.tsx':'Health','src/pages/Reports.tsx':'Reports','src/pages/ContentHub.tsx':'Content'}
ok=[v for k,v in files.items() if os.path.exists(k)]
miss=[v for k,v in files.items() if not os.path.exists(k)]
print(f'Present: {ok}')
if miss: print(f'MISSING: {miss}')
else: print('ALL FILES PRESENT — EMPIRE READY')
"
**PostAction:** bridge final status

## COMPLETED
## NOTES: All scripts in ~/Downloads/ | Bridge via BRIDGE_SECRET | Supabase via SUPABASE_SERVICE_KEY
