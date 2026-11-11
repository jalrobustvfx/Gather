"""Durable local watches. No task, thread, or OS scheduler is created."""
import difflib
import hashlib
import json
import re
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

def canonical(url):
    p=urlsplit(url)
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password:
        raise ValueError('Use a public http or https URL.')
    return p._replace(fragment='').geturl().rstrip('/')

def snapshot(page):
    if re.match(r'just a moment|access denied|sign in|log in|attention required',page.get('title',''),re.I):
        raise ValueError('This page requires sign-in or blocks automatic reading.')
    # Compare readable content, never HTML classes, scripts, advertisements or timestamps.
    text='\n'.join([page.get('title',''),page.get('description',''),*page.get('headings',[]),page.get('text','')])
    text=re.sub(r'\b\d+\s+(seconds?|minutes?|hours?) ago\b','',text,flags=re.I)
    return re.sub(r'\s+',' ',text).strip()[:26000]

def meaningful_change(before,after,keywords):
    if before==after: return None
    matcher=difflib.SequenceMatcher(None,before.split(),after.split(),autojunk=False)
    additions=[];removals=[];contexts=[]
    old=before.split();new=after.split()
    for action,a,b,c,d in matcher.get_opcodes():
        if action in ('insert','replace'): additions.extend(new[c:d])
        if action in ('delete','replace'): removals.extend(old[a:b])
        if action!='equal':contexts.extend(new[max(0,c-8):d+8]+old[max(0,a-8):b+8])
    added=' '.join(additions);removed=' '.join(removals)
    if len(added)+len(removed)<30:return None
    if keywords and not any(re.search(r'(?<!\w)'+re.escape(word)+r'(?!\w)',' '.join(contexts),re.I) for word in keywords):return None
    return {'summary':('Added or changed: '+added[:600]) if added else ('Removed: '+removed[:600]),'added':added[:1200],'removed':removed[:1200]}

class WatchService:
    def __init__(self,path,fetcher):
        self.path=Path(path);self.fetcher=fetcher;self.lock=threading.RLock();self.busy=set()
        self.state={'watches':[],'updates':[]}
        if self.path.exists():self.state=json.loads(self.path.read_text(encoding='utf-8'))

    def save(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        temp=self.path.with_suffix('.tmp');temp.write_text(json.dumps(self.state,ensure_ascii=False),encoding='utf-8');temp.replace(self.path)

    def public(self):
        with self.lock:
            return {'watches':[{k:v for k,v in w.items() if k not in ('baseline','seen')}|{'checking':w['id'] in self.busy} for w in self.state['watches']], 'updates':list(self.state['updates']),'running':True}

    def create(self,body):
        url=canonical(body.get('url',''))
        interval=int(body.get('interval',60))
        if interval not in (15,60,360,1440):raise ValueError('Choose a supported check interval.')
        keywords=[w.strip().lower()[:60] for w in str(body.get('keywords','')).split(',') if w.strip()][:10]
        with self.lock:
            if any(w['url']==url for w in self.state['watches']):raise ValueError('This page is already on your watchlist.')
            watch={'id':str(uuid.uuid4()),'url':url,'title':str(body.get('title') or urlsplit(url).hostname)[:160],'keywords':keywords,'interval':interval,'paused':False,'createdAt':time.time(),'nextCheck':time.time(),'lastChecked':None,'lastError':'','baseline':None,'seen':[]}
            self.state['watches'].append(watch);self.save()
        threading.Thread(target=self.check,args=(watch['id'],),daemon=True).start()
        return self.public()

    def check(self,watch_id):
        with self.lock:
            watch=next((w for w in self.state['watches'] if w['id']==watch_id),None)
            if not watch or watch_id in self.busy:return
            self.busy.add(watch_id);url=watch['url']
        try:
            page=self.fetcher(url);content=snapshot(page)
            if len(content)<20:raise ValueError('No readable page content was found.')
            with self.lock:
                if watch not in self.state['watches']:return
                digest=hashlib.sha256(content.encode()).hexdigest()
                delta=meaningful_change(watch['baseline'],content,watch['keywords']) if watch['baseline'] is not None else None
                if delta and digest not in watch['seen']:
                    self.state['updates'].insert(0,{'id':str(uuid.uuid4()),'watchId':watch_id,'title':page.get('title') or watch['title'],'url':url,'createdAt':time.time(),'read':False,**delta})
                    self.state['updates']=self.state['updates'][:300]
                watch.update(baseline=content,title=page.get('title') or watch['title'],lastError='')
                watch['seen']=(watch['seen']+[digest])[-30:]
        except Exception as error:
            with self.lock:watch['lastError']=str(error)[:200]
        finally:
            with self.lock:
                watch['lastChecked']=time.time();watch['nextCheck']=time.time()+watch['interval']*60
                self.busy.discard(watch_id);self.save()

    def action(self,body):
        action=body.get('action');watch_id=body.get('id')
        with self.lock:
            watch=next((w for w in self.state['watches'] if w['id']==watch_id),None)
            if action=='read':
                for update in self.state['updates']:
                    if body.get('id') in ('all',update['id']):update['read']=True
            elif not watch:raise ValueError('Watch not found.')
            elif action=='pause':watch['paused']=not watch['paused']
            elif action=='delete':self.state['watches'].remove(watch)
            elif action=='check':threading.Thread(target=self.check,args=(watch_id,),daemon=True).start()
            else:raise ValueError('Unknown action.')
            self.save()
        return self.public()

    def start(self):
        def loop():
            while True:
                with self.lock:due=[w['id'] for w in self.state['watches'] if not w['paused'] and w['nextCheck']<=time.time() and w['id'] not in self.busy]
                # Serial scheduled checks limit load on both the machine and websites.
                for watch_id in due:self.check(watch_id)
                time.sleep(20)
        threading.Thread(target=loop,daemon=True).start()
