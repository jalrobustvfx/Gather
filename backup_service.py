"""Folder backups of staged collections; scheduling runs while Gather's server runs."""
import copy
import json
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


class BackupService:
    interval = 12 * 60 * 60

    def __init__(self, path, watches=None, clock=time.time):
        self.path = Path(path)
        self.watches = watches
        self.clock = clock
        self.lock = threading.RLock()
        self.state = {'folder': None, 'enabled': True, 'lastBackup': None,
                      'nextBackup': None, 'lastError': '', 'libraries': {}}
        if self.path.exists():
            self.state.update(json.loads(self.path.read_text(encoding='utf-8')))
        self.picker = None

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix('.tmp')
        temp.write_text(json.dumps(self.state, ensure_ascii=False), encoding='utf-8')
        temp.replace(self.path)

    def public(self):
        with self.lock:
            return {**{k: v for k, v in self.state.items() if k != 'libraries'},
                    'libraries': [{'id': key, 'label': entry['label'],
                                   'items': len(entry['data']['items']), 'syncedAt': entry['syncedAt']}
                                  for key, entry in self.state['libraries'].items()],
                    'picker': copy.deepcopy(self.picker), 'running': True}

    def stage(self, body):
        library_id = body.get('id', '')
        data = body.get('data')
        try:
            uuid.UUID(library_id)
        except (ValueError, TypeError, AttributeError):
            raise ValueError('Invalid collection identifier.')
        if not isinstance(data, dict) or data.get('version') != 1 or not all(
                isinstance(data.get(key), list) for key in ('items', 'boards')):
            raise ValueError('Invalid collection backup.')
        if any(not isinstance(item, dict) or not isinstance(item.get('url'), str) for item in data['items']):
            raise ValueError('Invalid saved link.')
        with self.lock:
            previous = self.state['libraries'].get(library_id)
            self.state['libraries'][library_id] = {
                'label': 'Chrome extension' if body.get('extension') else 'Browser collection',
                'data': copy.deepcopy(data), 'syncedAt': self.clock()}
            if not previous or previous['data'] != data:
                self.save()
        return self.public()

    def configure(self, folder=None, enabled=None):
        with self.lock:
            if folder is not None:
                target = Path(folder)
                if not target.is_absolute() or not target.is_dir():
                    raise ValueError('Choose an existing folder.')
                # Remember only a directory actually selected through the native picker.
                self.state['folder'] = str(target.resolve())
            if enabled is not None:
                if not isinstance(enabled, bool):
                    raise ValueError('Invalid automatic backup setting.')
                self.state['enabled'] = enabled
            if self.state['folder'] and not self.state['nextBackup']:
                self.state['nextBackup'] = self.clock() + self.interval
            self.save()
        return self.public()

    def recovery(self):
        with self.lock:
            return {'libraries': [{ 'id': key, 'items': len(entry['data']['items']),
                       'screenshots': sum(bool(item.get('screenshot')) for item in entry['data']['items']),
                       'syncedAt': entry['syncedAt']}
                    for key, entry in self.state['libraries'].items()
                    if entry['label'] == 'Chrome extension' and entry['data']['items']]}

    def restore(self, library_id):
        with self.lock:
            entry = self.state['libraries'].get(library_id)
            if not entry or entry['label'] != 'Chrome extension':
                raise ValueError('The saved Chrome library is not available.')
            return {'id': library_id, 'data': copy.deepcopy(entry['data'])}

    def choose_folder(self):
        with self.lock:
            if self.picker and self.picker['status'] == 'choosing':
                return self.public()
            self.picker = {'status': 'choosing', 'error': ''}
        def choose():
            root = None
            try:
                from tkinter import Tk, filedialog
                root = Tk()
                root.withdraw()
                root.attributes('-topmost', True)
                folder = filedialog.askdirectory(title='Choose your Gather backup folder', parent=root,
                                                 mustexist=True)
                if folder:
                    self.configure(folder=folder)
                with self.lock:
                    self.picker = {'status': 'selected' if folder else 'cancelled', 'error': ''}
            except Exception as error:
                with self.lock:
                    self.picker = {'status': 'error', 'error': 'Folder picker could not open: ' + str(error)[:140]}
            finally:
                if root is not None:
                    root.destroy()
        threading.Thread(target=choose, daemon=True).start()
        return self.public()

    def run(self):
        with self.lock:
            try:
                if not self.state['folder']:
                    raise ValueError('Choose a backup folder first.')
                if not self.state['libraries']:
                    raise ValueError('Connect your collection before backing up.')
                target = Path(self.state['folder'])
                if not target.is_dir():
                    raise ValueError('The backup folder is unavailable. Reconnect the drive or choose another folder.')
                now = self.clock()
                stamp = datetime.fromtimestamp(now, timezone.utc).strftime('%Y-%m-%d_%H-%M-%S_UTC')
                destination = target / ('gather-' + stamp + '-' + uuid.uuid4().hex[:8])
                destination.mkdir()
                files = []
                for library_id, entry in self.state['libraries'].items():
                    name = ('chrome-' if entry['label'] == 'Chrome extension' else 'browser-') + library_id + '.json'
                    payload = {**entry['data'], 'backup': {'createdAt': now, 'syncedAt': entry['syncedAt'], 'label': entry['label']}}
                    (destination / name).write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
                    files.append({'file': name, 'label': entry['label'], 'items': len(entry['data']['items']), 'syncedAt': entry['syncedAt']})
                if self.watches:
                    with self.watches.lock:
                        watch_state = copy.deepcopy(self.watches.state)
                    (destination / 'watch-state.json').write_text(json.dumps(watch_state, ensure_ascii=False), encoding='utf-8')
                # Written last: its presence marks a complete backup, never an interrupted one.
                (destination / 'backup.json').write_text(json.dumps({'format': 'gather-backup', 'version': 1,
                    'createdAt': now, 'collections': files, 'watchState': bool(self.watches)}, indent=2), encoding='utf-8')
                next_backup = self.state['nextBackup']
                if not next_backup or next_backup <= now:
                    next_backup = now + self.interval
                self.state.update(lastBackup=now, nextBackup=next_backup,
                                  lastError='', lastFolder=str(destination))
            except (OSError, ValueError) as error:
                self.state['lastError'] = str(error)[:200]
                self.save()
                raise ValueError(self.state['lastError'])
            self.save()
        return self.public()

    def tick(self):
        with self.lock:
            due = (self.state['enabled'] and self.state['folder'] and self.state['nextBackup']
                   and self.clock() >= self.state['nextBackup'])
        if due:
            self.run()

    def start(self):
        def loop():
            while True:
                try:
                    self.tick()
                except (OSError, ValueError):
                    pass  # Error remains visible; retry once per minute when a drive returns.
                time.sleep(60)
        threading.Thread(target=loop, daemon=True).start()
