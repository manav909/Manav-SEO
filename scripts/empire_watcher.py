#!/usr/bin/env python3
"""SEO Season Empire Watcher — auto-runs new scripts + executes CLAUDE_CHAT tasks"""
import os,sys,ssl,json,time,re,subprocess,urllib.request,hashlib
from datetime import datetime

def load_env():
    for f in [".env","../.env"]:
        try:
            for line in open(f).read().splitlines():
                if "=" in line and not line.startswith("#"):
                    k,v=line.split("=",1); os.environ.setdefault(k.strip(),v.strip())
            break
        except: pass
load_env()

BRIDGE_SECRET=os.environ.get("BRIDGE_SECRET","")
BRIDGE_URL="https://seoseason.com/api/bridge"
ANTHROPIC_KEY=os.environ.get("ANTHROPIC_API_KEY","")
SUPABASE_URL=(os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL","")).rstrip("/")
SERVICE_KEY=os.environ.get("SUPABASE_SERVICE_KEY","")
DOWNLOADS=os.path.expanduser("~/Downloads")
REPO_DIR=os.getcwd()
CTX=ssl.create_default_context(); CTX.check_hostname=False; CTX.verify_mode=ssl.CERT_NONE
ran_files:dict={}

def bridge(body,task="watcher",kind="status"):
    try:
        req=urllib.request.Request(BRIDGE_URL,method="POST",
            data=json.dumps({"kind":kind,"title":f"Watcher.{task}",
                "body":str(body)[:2000],"created_by":"claude_code",
                "metadata":{"watcher":True}}).encode(),
            headers={"Content-Type":"application/json","x-bridge-secret":BRIDGE_SECRET})
        with urllib.request.urlopen(req,context=CTX,timeout=10) as r: pass
    except: pass

def sh(cmd,timeout=700):
    r=subprocess.run(cmd,shell=True,capture_output=True,text=True,timeout=timeout)
    return r.returncode==0,(r.stdout+r.stderr).strip()

def file_hash(path):
    try: return hashlib.md5(open(path,"rb").read()).hexdigest()
    except: return ""

def run_script(path):
    name=os.path.basename(path); h=file_hash(path)
    if ran_files.get(path)==h: return
    ran_files[path]=h
    print(f"\n[{datetime.now().strftime(\'%H:%M:%S\')}] Running {name}")
    bridge(f"Auto-running {name}",f"run_{name.replace(\'.py\'\'')}","thinking")
    ok,out=sh(f"python3 {path}",timeout=700)
    bridge(f"{\'SUCCESS\' if ok else \'FAILED\'}: {name}\n{out[-600:]}",f"done_{name[:20]}")

def check_downloads():
    try:
        files=[f for f in os.listdir(DOWNLOADS)
               if f.startswith(("empire_","build_","add_","rebuild_")) and f.endswith(".py")]
        for fname in sorted(files):
            fpath=os.path.join(DOWNLOADS,fname)
            h=file_hash(fpath)
            if ran_files.get(fpath)!=h:
                run_script(fpath)
    except Exception as e: print(f"  download check: {e}")

def run_chat_tasks():
    try:
        content=open("CLAUDE_CHAT.md").read()
        tasks=re.findall(
            r'### (TASK-[^\s]+) \[PENDING\]\n\*\*Action:\*\* (.+?)\n\*\*Command:\*\* (.+?)\n\*\*PostAction:\*\* (.+?)(?:\n|$)',
            content)
        if not tasks: return
        tid,action,command,postaction=tasks[0]
        print(f"\n  Executing {tid}: {action}")
        bridge(f"Executing {tid}: {action}",tid,"thinking")
        cmd=os.path.expanduser(command.strip())
        ok,out=sh(cmd,timeout=700)
        bridge(f"{tid} {\'OK\' if ok else \'FAIL\'}\n{out[-1200:]}",tid)
        ts=datetime.now().strftime(\'%Y-%m-%d %H:%M\')
        content=content.replace(f"### {tid} [PENDING]",f"### {tid} [DONE {ts}]")
        open("CLAUDE_CHAT.md","w").write(content)
        sh(f"git add CLAUDE_CHAT.md")
        sh(f'git commit -m "auto: {tid} done"')
        sh("git push")
    except Exception as e: print(f"  chat task: {e}")

def write_status():
    try:
        _,git_log=sh("git log --oneline -8")
        _,branch=sh("git branch --show-current")
        pages=len([f for f in os.listdir("src/pages") if f.endswith(".tsx")]) if os.path.exists("src/pages") else 0
        libs=len([f for f in os.listdir("api/lib") if f.endswith(".ts")]) if os.path.exists("api/lib") else 0
        te=open("api/task-engine.ts").read() if os.path.exists("api/task-engine.ts") else ""
        actions=re.findall(r"action === \'([^\']+)\'",te)
        
        tables_ok=[]
        for t in ["morning_briefs","llm_citations","reports","content_briefs","client_health",
                  "alerts","prospects","staff_members","lead_assignments","conversation_threads"]:
            try:
                req=urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{t}?limit=0",
                    headers={"apikey":SERVICE_KEY,"Authorization":f"Bearer {SERVICE_KEY}"})
                with urllib.request.urlopen(req,context=CTX,timeout=5): tables_ok.append(t)
            except Exception as e:
                if "404" not in str(e) and "relation" not in str(e).lower(): tables_ok.append(t)
        
        chat=open("CLAUDE_CHAT.md").read() if os.path.exists("CLAUDE_CHAT.md") else ""
        pending=re.findall(r'### (TASK-[^\s]+) \[PENDING\]',chat)
        done=re.findall(r'### (TASK-[^\s]+) \[DONE',chat)
        
        status=f"""# SEO Season Empire Status
Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC
Branch: {branch}

## Build
- Pages: {pages} | Libs: {libs} | Actions: {len(actions)}
- Tasks done: {len(done)} | Pending: {len(pending)} {pending}
- DB tables OK: {len(tables_ok)}

## Recent Commits
{git_log}
"""
        open("EMPIRE_STATUS.md","w").write(status)
        sh("git add EMPIRE_STATUS.md")
        sh(f'git commit -m "status: {datetime.now().strftime('%H:%M')} — {pages}p {len(actions)}a {len(pending)} pending"')
        sh("git push")
        bridge(f"Status: {pages}p {len(actions)}a {len(pending)} pending tasks","status_update")
        save_ran()
        print(f"  [{datetime.now().strftime('%H:%M')}] Status written")
    except Exception as e: print(f"  status: {e}")

def auto_check():
    if not ANTHROPIC_KEY: return
    try:
        _,log=sh("git log --oneline -5")
        _,pages=sh("ls src/pages/*.tsx 2>/dev/null | wc -l")
        _,tsc=sh("npx tsc --noEmit 2>&1 | head -3")
        req=urllib.request.Request("https://api.anthropic.com/v1/messages",method="POST",
            data=json.dumps({"model":"claude-haiku-4-5-20251001","max_tokens":400,
                "messages":[{"role":"user","content":
                    f"SEO Season empire. Recent commits:\n{log}\nPages:{pages}\nTSC:{tsc}\n"
                    "What ONE specific thing needs fixing or building next? Be concrete."}]}).encode(),
            headers={"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"})
        with urllib.request.urlopen(req,context=CTX,timeout=15) as r:
            resp=json.loads(r.read())
            suggestion=resp.get("content",[{}])[0].get("text","")
            if suggestion: bridge(f"Auto-supervision:\n{suggestion}","auto_check")
    except Exception as e: print(f"  auto_check: {e}")


def post_question(question, context=""):
    """Post a question to QUESTIONS.md for Claude Chat to see and answer."""
    try:
        qfile = open("QUESTIONS.md").read() if os.path.exists("QUESTIONS.md") else "# Questions\n## OPEN\n## ANSWERED\n"
        nums = [int(m) for m in re.findall(r"Q-(\d+)", qfile)]
        qid = f"Q-{max(nums)+1:03d}" if nums else "Q-001"
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"\n### {qid} [OPEN]\n**Asked:** {ts}\n**Question:** {question}\n**Context:** {context[:400]}\n"
        if "## OPEN" in qfile:
            qfile = qfile.replace("## OPEN\n", f"## OPEN\n{entry}")
        else:
            qfile += entry
        open("QUESTIONS.md","w").write(qfile)
        sh("git add QUESTIONS.md")
        sh(f'git commit -m "question: {qid}"')
        sh("git push")
        bridge(f"Posted question to QUESTIONS.md: {question[:60]}", "question_posted")
        print(f"  Question posted: {qid}")
    except Exception as e:
        print(f"  post_question error: {e}")

def check_build_health():
    """Run TSC and post any errors as questions for Claude Chat."""
    # Find npm/node first
    npm_cmd = "npm"
    for npm_p in ["/usr/local/bin/npm","/usr/bin/npm"]:
        if os.path.exists(npm_p):
            npm_cmd = npm_p
            break
    try:
        import glob
        nvm_bins = glob.glob(os.path.expanduser("~/.nvm/versions/node/*/bin/npm"))
        if nvm_bins: npm_cmd = sorted(nvm_bins)[-1]
    except: pass
    ok, tsc_out = sh(f"cd {REPO_DIR} && {npm_cmd.replace('npm','npx')} tsc --noEmit 2>&1 | head -20", timeout=90)
    if not ok and "error TS" in tsc_out:
        errors = re.findall(r"(src/[^\(]+\.tsx?)\(\d+", tsc_out)[:3]
        post_question(
            f"TypeScript build errors found — {len(errors)} files affected",
            f"TSC output:\n{tsc_out[:600]}\nFiles: {errors}"
        )
        bridge(f"Build errors detected and posted to QUESTIONS.md:\n{tsc_out[:400]}", "build_error", "error")
    return ok


RAN_FILE=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","empire_ran.json")
def load_ran():
    try: return json.load(open(RAN_FILE))
    except: return {}
def save_ran():
    try: json.dump(ran_files,open(RAN_FILE,"w"))
    except: pass

if __name__=="__main__":
    ran_files.update(load_ran())
    print("="*50)
    print("Empire Watcher ACTIVE")
    print(f"Downloads: {DOWNLOADS}")
    print(f"Interval: 30s checks | 10min status | 30min auto-check")
    print(f"Previously ran: {len(ran_files)} scripts")
    print("="*50)
    bridge("Watcher started. Watching Downloads + CLAUDE_CHAT.md","start","thinking")
    write_status()
    last_status=time.time(); last_auto=time.time(); cycle=0
    while True:
        try:
            cycle+=1
            sh("git pull --rebase origin main 2>/dev/null || true")
            check_downloads()
            run_chat_tasks()
            if time.time()-last_status>600:
                write_status(); last_status=time.time()
            if time.time()-last_auto>1800:
                auto_check(); last_auto=time.time()
            if cycle%20==0:
                check_build_health()
            if cycle%4==0:
                print(f"  [{datetime.now().strftime('%H:%M:%S')}] Watching... cycle {cycle}")
            time.sleep(30)
        except KeyboardInterrupt:
            bridge("Watcher stopped.","stop"); break
        except Exception as e:
            bridge(f"Error: {e}","error"); time.sleep(30)
