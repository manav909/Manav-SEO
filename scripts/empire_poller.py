#!/usr/bin/env python3
"""SEO Season Empire Poller — reads CLAUDE_CHAT.md, executes PENDING tasks."""
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
CHAT_FILE="CLAUDE_CHAT.md"
CTX=ssl.create_default_context(); CTX.check_hostname=False; CTX.verify_mode=ssl.CERT_NONE

def bridge(body,task="poller",kind="status"):
    try:
        req=urllib.request.Request(BRIDGE_URL,method="POST",
            data=json.dumps({"kind":kind,"title":f"Poller.{task}",
                "body":str(body)[:3000],"created_by":"claude_code",
                "metadata":{"poller":True}}).encode(),
            headers={"Content-Type":"application/json","x-bridge-secret":BRIDGE_SECRET})
        with urllib.request.urlopen(req,context=CTX,timeout=10) as r: pass
    except Exception as e: print(f"  bridge: {e}")

def sh(cmd,timeout=600):
    r=subprocess.run(cmd,shell=True,capture_output=True,text=True,timeout=timeout)
    return r.returncode==0,(r.stdout+r.stderr).strip()

def get_pending():
    try:
        c=open(CHAT_FILE).read()
        tasks=re.findall(
            r'### (TASK-\d+) \[PENDING\]\n\*\*Action:\*\* (.+?)\n\*\*Command:\*\* (.+?)\n\*\*PostAction:\*\* (.+?)\n',
            c)
        return tasks
    except: return []

def mark_done(tid,result=""):
    try:
        c=open(CHAT_FILE).read()
        ts=datetime.now().strftime('%Y-%m-%d %H:%M')
        c=c.replace(f"### {tid} [PENDING]",f"### {tid} [DONE {ts}]")
        open(CHAT_FILE,"w").write(c)
        sh(f"git add {CHAT_FILE}")
        sh(f'git commit -m "chore: {tid} done"')
        sh("git push")
    except Exception as e: print(f"  mark_done: {e}")

def pull_latest():
    sh("git pull --rebase origin main 2>/dev/null || git pull origin main 2>/dev/null")

def execute(tid,action,command,postaction):
    print(f"\n{'='*40}\n{tid}: {action}\n{'='*40}")
    bridge(f"Starting {tid}: {action}",tid,"thinking")
    cmd=os.path.expanduser(command.strip())
    ok,out=sh(cmd,timeout=700)
    print(f"  {'OK' if ok else 'FAIL'}: {out[-300:]}")
    bridge(f"{tid} {'SUCCESS' if ok else 'FAILED'}:\n{out[-1500:]}",tid)
    mark_done(tid,out[-200:])
    return ok

def auto_check():
    if not ANTHROPIC_KEY: return
    try:
        _,log=sh("git log --oneline -5")
        _,pages=sh("ls src/pages/ 2>/dev/null | wc -l")
        _,tsc=sh("npx tsc --noEmit 2>&1 | head -3")
        req=urllib.request.Request("https://api.anthropic.com/v1/messages",
            method="POST",
            data=json.dumps({"model":"claude-haiku-4-5-20251001","max_tokens":400,
                "messages":[{"role":"user","content":
                    f"SEO Season empire build. Recent commits:\n{log}\nPages: {pages}\nTSC: {tsc}\n"
                    "What ONE thing should Claude Code check or fix right now? Be specific."}]}).encode(),
            headers={"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"})
        with urllib.request.urlopen(req,context=CTX,timeout=15) as r:
            resp=json.loads(r.read())
            suggestion=resp.get("content",[{}])[0].get("text","")
            if suggestion: bridge(f"Auto-supervision:\n{suggestion}","auto_check")
    except Exception as e: print(f"  auto_check: {e}")

if __name__=="__main__":
    print("="*50)
    print("Empire Poller ACTIVE")
    print(f"Watching: {CHAT_FILE}")
    print("="*50)
    bridge("Empire poller started. Reading CLAUDE_CHAT.md every 60s.","start","thinking")
    check_count=0
    while True:
        try:
            pull_latest()
            tasks=get_pending()
            if tasks:
                tid,action,command,postaction=tasks[0]
                execute(tid,action,command,postaction)
                time.sleep(3)
            else:
                check_count+=1
                if check_count%10==0: auto_check()
                print(f"  [{datetime.now().strftime('%H:%M:%S')}] Queue empty. Watching...")
                time.sleep(60)
        except KeyboardInterrupt:
            bridge("Poller stopped.","stop"); break
        except Exception as e:
            bridge(f"Poller error: {e}","error"); time.sleep(30)
