# Claude Chat ↔ Claude Code Communication
# Poller reads PENDING tasks every 60s
# Claude Chat updates via new task scripts
# STATUS: ACTIVE

### TASK-001 [DONE 2026-05-16 05:05]
**Action:** Run empire_vision_a.py — 10 tables + 6 libs + 30 actions
**Command:** python3 ~/Downloads/empire_vision_a.py
**PostAction:** bridge results

### TASK-002 [DONE 2026-05-16 05:05]
**Action:** Run empire_vision_b.py — 15 pages + automation
**Command:** python3 ~/Downloads/empire_vision_b.py
**PostAction:** bridge results

### TASK-003 [DONE 2026-05-16 05:05]
**Action:** Run empire_quality.py — Brain wired to all 9 AI points
**Command:** python3 ~/Downloads/empire_quality.py
**PostAction:** bridge results

### TASK-004 [DONE 2026-05-16 05:05]
**Action:** Apply SQL migrations via psycopg2 or pgmeta
**Command:** python3 ~/Downloads/empire_migrate.py
**PostAction:** bridge table counts

### TASK-005 [DONE 2026-05-16 11:56]
**Action:** TypeScript check — fix any errors
**Command:** npx tsc --noEmit 2>&1 | head -20
**PostAction:** bridge tsc output, fix if errors

### TASK-006 [DONE 2026-05-16 11:56]
**Action:** Full status report to bridge
**Command:** python3 ~/Downloads/empire_reporter.py
**PostAction:** bridge full report

### TASK-007 [DONE 2026-05-16 11:56]
**Action:** Generate morning brief
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H "Content-Type: application/json" -d "{"action":"generate_morning_brief","scope":"empire"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('headline','done'))"
**PostAction:** bridge result

### TASK-008 [DONE 2026-05-16 11:56]
**Action:** Calculate all client health scores
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H "Content-Type: application/json" -d "{"action":"calculate_all_health"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('done:',d.get('processed',0),'projects')"
**PostAction:** bridge result

### TASK-009 [DONE 2026-05-16 11:56]
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

### TASK-010 [DONE 2026-05-16 11:56]
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


### TASK-011 [PENDING]
**Action:** Apply Supabase migrations for 7 new vision tables
**Command:** python3 -c "
import os,ssl,json,re,urllib.request
def load_env():
    for f in ['.env','../.env']:
        try:
            for line in open(f).read().splitlines():
                if '=' in line and not line.startswith('#'):
                    k,v=line.split('=',1); os.environ.setdefault(k.strip(),v.strip())
            break
        except: pass
load_env()
url=(os.environ.get('SUPABASE_URL') or os.environ.get('VITE_SUPABASE_URL','')).rstrip('/')
key=os.environ.get('SUPABASE_SERVICE_KEY','')
CTX=ssl.create_default_context(); CTX.check_hostname=False; CTX.verify_mode=ssl.CERT_NONE
ref=re.sub(r'https?://([^.]+)\.supabase\.co.*',r'\1',url)
tables=[
  ('morning_briefs','CREATE TABLE IF NOT EXISTS morning_briefs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, brief_date date NOT NULL DEFAULT CURRENT_DATE, scope text DEFAULT \'empire\', project_id uuid, headline text NOT NULL DEFAULT \'Empire operational\', priority_actions jsonb DEFAULT \'[]\'::jsonb, wins jsonb DEFAULT \'[]\'::jsonb, risks jsonb DEFAULT \'[]\'::jsonb, opportunities jsonb DEFAULT \'[]\'::jsonb, algorithm_watch jsonb DEFAULT \'[]\'::jsonb, delivered boolean DEFAULT false, created_at timestamptz DEFAULT now())'),
  ('llm_citations','CREATE TABLE IF NOT EXISTS llm_citations (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL, checked_at timestamptz DEFAULT now(), query text NOT NULL, model text NOT NULL DEFAULT \'claude-haiku\', cited boolean DEFAULT false, sentiment text DEFAULT \'not_mentioned\', response_excerpt text, improvement_hint text, created_at timestamptz DEFAULT now())'),
  ('reports','CREATE TABLE IF NOT EXISTS reports (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL, report_type text NOT NULL DEFAULT \'weekly\', period_start date, period_end date, title text NOT NULL, html_content text NOT NULL DEFAULT \'\', token text UNIQUE DEFAULT encode(gen_random_bytes(24),\'hex\'), status text DEFAULT \'draft\', highlights jsonb DEFAULT \'[]\'::jsonb, metrics_snapshot jsonb DEFAULT \'{}\', created_at timestamptz DEFAULT now())'),
  ('content_briefs','CREATE TABLE IF NOT EXISTS content_briefs (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL, title text NOT NULL, target_keyword text NOT NULL, secondary_keywords jsonb DEFAULT \'[]\'::jsonb, search_intent text DEFAULT \'informational\', word_count integer DEFAULT 1500, structure jsonb DEFAULT \'[]\'::jsonb, llm_optimization jsonb DEFAULT \'{}\', entity_coverage jsonb DEFAULT \'[]\'::jsonb, brief_content text DEFAULT \'\', priority text DEFAULT \'medium\', status text DEFAULT \'draft\', created_at timestamptz DEFAULT now())'),
  ('client_health','CREATE TABLE IF NOT EXISTS client_health (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid NOT NULL UNIQUE, overall_score integer DEFAULT 50, brain_score integer DEFAULT 50, velocity_score integer DEFAULT 50, churn_risk text DEFAULT \'low\', churn_signals jsonb DEFAULT \'[]\'::jsonb, upsell_signals jsonb DEFAULT \'[]\'::jsonb, recommended_action text DEFAULT \'Continue current strategy\', days_to_renewal integer, created_at timestamptz DEFAULT now())'),
  ('alerts','CREATE TABLE IF NOT EXISTS alerts (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, project_id uuid, alert_type text NOT NULL DEFAULT \'info\', severity text DEFAULT \'info\', title text NOT NULL, body text NOT NULL DEFAULT \'\', data jsonb DEFAULT \'{}\', read_at timestamptz, created_at timestamptz DEFAULT now())'),
  ('prospects','CREATE TABLE IF NOT EXISTS prospects (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, email text, name text, company text, url text NOT NULL, lead_score integer DEFAULT 0, status text DEFAULT \'new\', instant_audit jsonb DEFAULT \'{}\', source text DEFAULT \'organic\', market text DEFAULT \'global\', opportunity_size text DEFAULT \'medium\', next_followup timestamptz, created_at timestamptz DEFAULT now())'),
]
created=[]
for name,sql in tables:
    try:
        req=urllib.request.Request(f'https://{ref}.supabase.co/pg/query',method='POST',
            data=json.dumps({'query':sql+";"}).encode(),
            headers={'Authorization':f'Bearer {key}','apikey':key,'Content-Type':'application/json'})
        with urllib.request.urlopen(req,context=CTX,timeout=20) as r:
            resp=json.loads(r.read())
            if 'error' not in str(resp).lower()[:80]:
                # RLS
                for rls in [f'ALTER TABLE {name} ENABLE ROW LEVEL SECURITY',f'DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=\'{name}\' AND policyname=\'svc\') THEN CREATE POLICY svc ON {name} FOR ALL USING (true); END IF; END \$\$']:
                    try:
                        req2=urllib.request.Request(f'https://{ref}.supabase.co/pg/query',method='POST',data=json.dumps({'query':rls}).encode(),headers={'Authorization':f'Bearer {key}','apikey':key,'Content-Type':'application/json'})
                        with urllib.request.urlopen(req2,context=CTX,timeout=10) as r2: pass
                    except: pass
                created.append(name)
                print(f'OK: {name}')
    except Exception as e:
        if 'already' in str(e).lower(): print(f'EXISTS: {name}'); created.append(name)
        else: print(f'ERR {name}: {e}')
print(f'Created/verified: {created}')
"
**PostAction:** bridge table creation results

### TASK-012 [DONE 2026-05-16 12:10]
**Action:** Generate first morning brief for empire
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H "Content-Type: application/json" -d "{"action":"generate_morning_brief","scope":"empire"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('Brief:',d.get('brief',{}).get('headline',d.get('headline','generated'))[:80])"
**PostAction:** bridge morning brief headline

### TASK-013 [DONE 2026-05-16 12:10]
**Action:** Calculate health scores for all projects
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H "Content-Type: application/json" -d "{"action":"calculate_all_health"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('Health calculated:',d.get('processed',0),'projects')"
**PostAction:** bridge health scores result

### TASK-014 [PENDING]
**Action:** Get empire stats and report to bridge
**Command:** curl -s -X POST https://seoseason.com/api/task-engine -H "Content-Type: application/json" -d "{"action":"get_empire_stats"}" | python3 -c "import sys,json;d=json.load(sys.stdin);s=d.get('stats',{});print('Empire stats — projects:',s.get('projects',0),'learnings:',s.get('learnings',0),'verified:',s.get('verifications',0),'alerts:',s.get('alertsUnread',0))"
**PostAction:** bridge empire stats

### TASK-015 [PENDING]
**Action:** Write EMPIRE_STATUS.md with full current state
**Command:** python3 -c "
import os,re,subprocess,datetime
_,log=subprocess.run('git log --oneline -8',shell=True,capture_output=True,text=True).stdout,None
ok,log=subprocess.run('git log --oneline -8',shell=True,capture_output=True,text=True).returncode,subprocess.run('git log --oneline -8',shell=True,capture_output=True,text=True).stdout
pages=len([f for f in os.listdir('src/pages') if f.endswith('.tsx')]) if os.path.exists('src/pages') else 0
libs=len([f for f in os.listdir('api/lib') if f.endswith('.ts')]) if os.path.exists('api/lib') else 0
te=open('api/task-engine.ts').read() if os.path.exists('api/task-engine.ts') else ''
actions=re.findall(r\"action === '([^']+)'\",te)
status=f'# SEO Season Empire Status
Updated: {datetime.datetime.now().isoformat()}

## Summary
- Pages: {pages}
- Lib modules: {libs}
- API actions: {len(actions)}

## Actions
{chr(10).join(sorted(actions))}

## Recent commits
{log}'
open('EMPIRE_STATUS.md','w').write(status)
print(f'Status written: {pages} pages, {libs} libs, {len(actions)} actions')
"
**PostAction:** git commit EMPIRE_STATUS.md and bridge summary


## COMPLETED
## NOTES: All scripts in ~/Downloads/ | Bridge via BRIDGE_SECRET | Supabase via SUPABASE_SERVICE_KEY
