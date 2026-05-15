#!/usr/bin/env python3
"""SEO Season Autonomous Empire Builder
Reads CLAUDE_CHAT.md for tasks, executes them, then asks Claude what to build next.
Run: python3 scripts/empire_poller.py
"""
import os,sys,ssl,json,time,re,subprocess,urllib.request
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
CHAT_FILE="CLAUDE_CHAT.md"
CTX=ssl.create_default_context(); CTX.check_hostname=False; CTX.verify_mode=ssl.CERT_NONE
CYCLE=0

def bridge(body,task="poller",kind="status"):
    try:
        req=urllib.request.Request(BRIDGE_URL,method="POST",
            data=json.dumps({"kind":kind,"title":f"Poller.{task}",
                "body":str(body)[:3000],"created_by":"claude_code",
                "metadata":{"cycle":CYCLE}}).encode(),
            headers={"Content-Type":"application/json","x-bridge-secret":BRIDGE_SECRET})
        with urllib.request.urlopen(req,context=CTX,timeout=10) as r: pass
    except Exception as e: print(f"  bridge: {e}")

def sh(cmd,timeout=600):
    r=subprocess.run(cmd,shell=True,capture_output=True,text=True,timeout=timeout)
    return r.returncode==0,(r.stdout+r.stderr).strip()

def pull():
    sh("git pull --rebase origin main 2>/dev/null || git pull origin main 2>/dev/null")

def get_pending():
    try:
        c=open(CHAT_FILE).read()
        return re.findall(
            r'### (TASK-\d+) \[PENDING\]\n\*\*Action:\*\* (.+?)\n\*\*Command:\*\* (.+?)\n\*\*PostAction:\*\* (.+?)(?:\n|$)',
            c)
    except: return []

def mark_done(tid):
    try:
        c=open(CHAT_FILE).read()
        c=c.replace(f"### {tid} [PENDING]",
                    f"### {tid} [DONE {datetime.now().strftime('%Y-%m-%d %H:%M')}]")
        open(CHAT_FILE,"w").write(c)
        sh(f"git add {CHAT_FILE}")
        sh(f'git commit -m "auto: {tid} done"')
        sh("git push")
    except Exception as e: print(f"  mark_done: {e}")

def execute(tid,action,command,postaction):
    global CYCLE
    CYCLE+=1
    print(f"\n{'='*45}\n[{CYCLE}] {tid}: {action}\n{'='*45}")
    bridge(f"Executing {tid}: {action}",tid,"thinking")
    cmd=os.path.expanduser(command.strip())
    ok,out=sh(cmd,timeout=700)
    result=f"{'OK' if ok else 'FAIL'}\n{out[-1500:]}"
    bridge(f"{tid} {result[:2000]}",tid)
    print(f"  {'✓' if ok else '✗'} {out[-200:]}")
    mark_done(tid)
    return ok,out

def get_repo_state():
    _,log=sh("git log --oneline -8")
    _,pages=sh("ls src/pages/*.tsx 2>/dev/null | wc -l")
    _,libs=sh("ls api/lib/*.ts 2>/dev/null | wc -l")
    _,actions=sh("grep -c \"action ===\" api/task-engine.ts 2>/dev/null || echo 0")
    _,tsc=sh("npx tsc --noEmit 2>&1 | tail -3")
    return f"Commits:\n{log}\nPages:{pages} Libs:{libs} Actions:{actions}\nTSC:{tsc}"

def ask_claude_next():
    if not ANTHROPIC_KEY: return None
    state=get_repo_state()
    vision=open("EMPIRE_VISION.md").read()[:3000] if os.path.exists("EMPIRE_VISION.md") else ""
    chat=open(CHAT_FILE).read()[:1000] if os.path.exists(CHAT_FILE) else ""
    try:
        req=urllib.request.Request("https://api.anthropic.com/v1/messages",
            method="POST",
            data=json.dumps({
                "model":"claude-sonnet-4-20250514","max_tokens":1500,
                "system": """You are the autonomous SEO Season empire builder. 
Your job: decide the SINGLE most valuable thing to build next and provide the exact code.
Empire vision: lead capture → proposal → onboard → execute → verify → learn → compound → scale.
Always build towards: more automation, better intelligence, better client results.
Be specific. Provide actual working code. Think like a world-class SaaS builder.""",
                "messages":[{"role":"user","content":
                    f"Current empire state:\n{state}\n\nVision:\n{vision}\n\nCurrent tasks:\n{chat}\n\n"
                    "What ONE thing should I build next? Give me a specific Python script that creates/modifies files. "
                    "Format: TASK: [name]\nFILE: [path]\nCODE:\n```python\n[complete code]\n```\n"
                    "REASON: [why this matters most]\nIMPACT: [what this unlocks]"}]
            }).encode(),
            headers={"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"})
        with urllib.request.urlopen(req,context=CTX,timeout=30) as r:
            resp=json.loads(r.read())
            suggestion=resp.get("content",[{}])[0].get("text","")
            bridge(f"Claude's next suggestion:\n{suggestion[:2000]}","vision","thinking")
            # Extract and run the Python code block
            code_blocks=re.findall(r"```python\n(.*?)```",suggestion,re.DOTALL)
            if code_blocks:
                code=code_blocks[0]
                with open("/tmp/_next_build.py","w") as f: f.write(code)
                ok,out=sh("python3 /tmp/_next_build.py",timeout=300)
                bridge(f"Auto-build result: {'OK' if ok else 'FAIL'}\n{out[-500:]}","auto_build")
                if ok:
                    sh("git add -A")
                    sh(f'git commit -m "auto: {suggestion[:60].split(chr(10))[0]}"')
                    sh("git push")
            return suggestion
    except Exception as e:
        bridge(f"Claude API error: {e}","error")
        return None

def post_status():
    state=get_repo_state()
    bridge(f"Empire status check:\n{state}","status")

if __name__=="__main__":
    print("="*50)
    print("SEO Season Empire Poller — RUNNING")
    print("="*50)
    bridge("Poller started. Reading CLAUDE_CHAT.md + calling Claude API for vision.","start","thinking")
    cycle_count=0
    while True:
        try:
            pull()
            tasks=get_pending()
            if tasks:
                tid,action,command,postaction=tasks[0]
                execute(tid,action,command,postaction)
                time.sleep(5)
            else:
                cycle_count+=1
                if cycle_count%5==0:
                    post_status()
                if cycle_count%15==0:
                    print(f"\n  [{datetime.now().strftime('%H:%M')}] Asking Claude for next build...")
                    ask_claude_next()
                print(f"  [{datetime.now().strftime('%H:%M:%S')}] Watching... (cycle {cycle_count})")
                time.sleep(60)
        except KeyboardInterrupt:
            bridge("Poller stopped.","stop"); break
        except Exception as e:
            bridge(f"Error: {e}","error"); time.sleep(30)
