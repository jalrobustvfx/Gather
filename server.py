"""Gather's local app and public-page reader. Python standard library only."""
import argparse
import http.client
import ipaddress
import json
import socket
import ssl
import time
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
from watch_service import WatchService
from backup_service import BackupService

ROOT = Path(__file__).resolve().parent
LIMIT = 1_500_000
WATCHES = None
BACKUPS = None

def public_target(url):
    parts = urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password:
        raise ValueError('Use a public http or https page link.')
    port = parts.port or (443 if parts.scheme == 'https' else 80)
    if port not in (80, 443):
        raise ValueError('Only public websites on standard ports can be read.')
    addresses = socket.getaddrinfo(parts.hostname, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Local and private network addresses cannot be read.')
    return parts, port, addresses[0][4][0]

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}; self.title = []; self.headings = []; self.text = []; self.paragraphs = []
        self.stack = []; self.suppressed = 0; self.current_heading = None; self.current_paragraph = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            key = (attrs.get('property') or attrs.get('name') or '').lower()
            self.meta.setdefault(key, attrs.get('content', ''))
        if tag in ('script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'svg'):
            self.suppressed += 1; self.stack.append(tag)
        if tag == 'title': self.in_title = True
        if not self.suppressed:
            if tag in ('h1', 'h2'): self.current_heading = []
            if tag == 'p': self.current_paragraph = []

    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag in self.stack:
            self.stack.remove(tag); self.suppressed = max(0, self.suppressed - 1)
        if tag in ('h1', 'h2') and self.current_heading is not None:
            self.headings.append(' '.join(self.current_heading)); self.current_heading = None
        if tag == 'p' and self.current_paragraph is not None:
            self.paragraphs.append(' '.join(self.current_paragraph)); self.current_paragraph = None

    def handle_data(self, text):
        text = ' '.join(text.split())
        if not text: return
        if getattr(self, 'in_title', False): self.title.append(text)
        if not self.suppressed:
            self.text.append(text)
            if self.current_heading is not None: self.current_heading.append(text)
            if self.current_paragraph is not None: self.current_paragraph.append(text)

    def result(self):
        m = self.meta
        return {'title': (m.get('og:title') or m.get('twitter:title') or ' '.join(self.title))[:160],
                'description': (m.get('og:description') or m.get('description') or m.get('twitter:description') or '')[:1000],
                'headings': self.headings[:12], 'text': ' '.join(self.text)[:24000],
                'excerpt': next((p for p in self.paragraphs if len(p) > 60), '')[:1000]}

def fetch_page(url):
    deadline = time.monotonic() + 10
    for _ in range(5):
        parts, port, address = public_target(url)
        remaining = deadline - time.monotonic()
        if remaining <= 0: raise ValueError('The page took too long to respond.')
        # Pin the socket to the already-validated IP. HTTPS still verifies the original hostname.
        connection = http.client.HTTPConnection(parts.hostname, port, timeout=min(5, remaining))
        sock = socket.create_connection((address, port), timeout=min(5, remaining))
        if parts.scheme == 'https': sock = ssl.create_default_context().wrap_socket(sock, server_hostname=parts.hostname)
        connection.sock = sock
        try:
            path = parts.path or '/'
            if parts.query: path += '?' + parts.query
            connection.request('GET', path, headers={'Host': parts.hostname, 'User-Agent': 'Mozilla/5.0 (compatible; Gather/0.2; link preview)', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location: raise ValueError('The page redirected without a destination.')
                url = urljoin(url, location); continue
            if response.status != 200: raise ValueError('This site did not allow its page to be read.')
            content_type = response.getheader('Content-Type', '')
            if not any(t in content_type.lower() for t in ('text/html', 'application/xhtml+xml')):
                raise ValueError('This link is not an HTML page.')
            raw = bytearray()
            while len(raw) <= LIMIT:
                if time.monotonic() > deadline: raise ValueError('The page took too long to read.')
                chunk = response.read1(min(65536, LIMIT + 1 - len(raw)))
                if not chunk: break
                raw.extend(chunk)
            if len(raw) > LIMIT: raw = raw[:LIMIT]
            charset = response.headers.get_content_charset() or 'utf-8'
            try: html = raw.decode(charset, errors='replace')
            except LookupError: html = raw.decode('utf-8', errors='replace')
            parser = PageParser(); parser.feed(html)
            result = parser.result()
            if not result['title'] and not result['text']: raise ValueError('No readable page content was found.')
            return result
        finally: connection.close()
    raise ValueError('The page redirected too many times.')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed(self):
        host = self.headers.get('Host', '').split(':')[0]
        origin = self.headers.get('Origin')
        return host in ('localhost', '127.0.0.1') and (not origin or origin in ('http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:4174', 'http://127.0.0.1:4174', 'http://localhost:4175', 'http://127.0.0.1:4175') or origin.startswith('chrome-extension://'))

    def end_headers(self):
        origin = self.headers.get('Origin')
        if self.allowed() and origin: self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def send_json(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)

    def do_OPTIONS(self):
        if not self.allowed(): return self.send_json(403, {'error': 'Origin not allowed.'})
        self.send_response(204); self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS'); self.send_header('Access-Control-Allow-Headers', 'Content-Type'); self.end_headers()

    def do_POST(self):
        if not self.allowed(): return self.send_json(403, {'error': 'Origin not allowed.'})
        if self.path not in ('/api/preview','/api/watch/state','/api/watch/create','/api/watch/action', '/api/backup/state', '/api/backup/stage', '/api/backup/folder', '/api/backup/settings', '/api/backup/run', '/api/backup/recovery', '/api/backup/restore'): return self.send_json(404, {'error': 'Not found.'})
        try:
            size = int(self.headers.get('Content-Length', 0))
            if size <= 0 or size > (500_000_000 if self.path == '/api/backup/stage' else 8192): raise ValueError('Invalid request size.')
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):raise ValueError('Invalid request.')
            if self.path.startswith('/api/backup/'):
                if BACKUPS is None: raise ValueError('Backup service is not running. Restart Gather with server.py.')
                action = self.path.rsplit('/', 1)[1]
                if action == 'stage': result = BACKUPS.stage(body)
                elif action == 'recovery': result = BACKUPS.recovery()
                elif action == 'restore': result = BACKUPS.restore(body.get('id'))
                elif action == 'folder': result = BACKUPS.choose_folder()
                elif action == 'settings': result = BACKUPS.configure(enabled=body.get('enabled'))
                elif action == 'run': result = BACKUPS.run()
                else: result = BACKUPS.public()
                return self.send_json(200, result)
            if self.path.startswith('/api/watch/'):
                if WATCHES is None:raise ValueError('Watch service is not running.')
                if self.path.endswith('/create'):
                    if not isinstance(body.get('url'),str):raise ValueError('Provide a page link.')
                    public_target(body['url'])
                    result=WATCHES.create(body)
                elif self.path.endswith('/action'):result=WATCHES.action(body)
                else:result=WATCHES.public()
                return self.send_json(200,result)
            if not isinstance(body.get('url'), str): raise ValueError('Provide a page link.')
            self.send_json(200, fetch_page(body['url']))
        except (ValueError, OSError, http.client.HTTPException) as error:
            self.send_json(422, {'error': str(error)[:180]})

    def do_GET(self):
        # Local captures and monitor state are never served as static downloads.
        if any(part.startswith('.') or part=='__pycache__' for part in unquote(self.path.split('?')[0]).split('/')):
            return self.send_error(404)
        return super().do_GET()

if __name__ == '__main__':
    args = argparse.ArgumentParser(); args.add_argument('--port', type=int, default=4173); options = args.parse_args()
    print(f'Gather is ready at http://localhost:{options.port}', flush=True)
    WATCHES=WatchService(ROOT/'.gather'/'watch-state.json',fetch_page)
    WATCHES.start()
    BACKUPS=BackupService(ROOT/'.gather'/'backup-state.json', WATCHES)
    BACKUPS.start()
    ThreadingHTTPServer(('127.0.0.1', options.port), Handler).serve_forever()
