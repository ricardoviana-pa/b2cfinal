#!/usr/bin/env python3
"""Read-only HTTP evidence for the editorial rollout; no browser JS or booking API.

Stores selected public metadata, never complete HTML, cookies or request headers.
Example:
  python3 scripts/audit-editorial-http.py --base https://www.portugalactive.com \
    --output docs/master-plan/evidence/seo-production-before.json
  python3 scripts/audit-editorial-http.py --base http://localhost:3029 \
    --output docs/master-plan/evidence/seo-local-after.json \
    --compare docs/master-plan/evidence/seo-production-before.json
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv']
DESTINATIONS = ['viana-do-castelo', 'minho', 'caminha', 'esposende', 'porto', 'douro', 'lisbon', 'alentejo', 'algarve']
GUIDES = ['viana-do-castelo-guide', 'when-to-visit-north-portugal']
EXEMPLAR = 'portugal-active-cabedelo-beach-lodge-heated-pool-16f0b2'
UA = 'Mozilla/5.0 (compatible; PortugalActiveEditorialReadOnly/1.0)'
MARKERS = {
    'planning_en': 'Choose your base', 'planning_pt': 'Escolher a sua base',
    'sources_en': 'Sources and updates', 'sources_pt': 'Fontes e atualização',
    'viana_revised_en': 'Two days in Viana do Castelo', 'viana_revised_pt': 'Dois dias em Viana do Castelo',
    'guide_review_en': 'About this update', 'guide_review_pt': 'Sobre esta atualização',
    'legacy_personal_visit_en': 'This is the city our team calls home',
    'legacy_restaurant_picks_en': "Our team's restaurant picks",
    'legacy_airport_time_en': '45 minutes by car', 'legacy_airport_time_pt': '45 minutos de carro',
    'legacy_crowds_zero_en': 'Crowds: Zero',
    'empty_homes_en': 'No homes available', 'empty_homes_pt': 'Sem casas disponíveis',
}


def compact(text):
    return re.sub(r'\s+', ' ', text).strip()


class PageSummary(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.h1, self.headings = [], [], []
        self.canonical, self.alternates, self.meta, self.schemas = [], [], {}, []
        self._capture, self._text, self._script, self._script_type = None, [], [], None
        self._hidden, self.visible = 0, []
        self._in_head = False
        self.html_lang, self.entry_bundles = None, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'head':
            self._in_head = True
        if tag == 'html':
            self.html_lang = a.get('lang')
        if tag in ('h1', 'h2', 'h3') or (tag == 'title' and self._in_head):
            self._capture, self._text = tag, []
        if tag == 'link':
            if a.get('rel') == 'canonical':
                self.canonical.append(a.get('href'))
            if a.get('rel') == 'alternate' and a.get('hreflang'):
                self.alternates.append({'language': a['hreflang'], 'href': a.get('href')})
        if tag == 'meta':
            name = a.get('name', a.get('property', '')).lower()
            if name in ('description', 'robots', 'googlebot', 'og:title', 'og:description', 'og:url', 'og:type', 'og:image'):
                self.meta.setdefault(name, []).append(a.get('content', ''))
        if tag in ('script', 'style'):
            self._hidden += 1
        if tag == 'script':
            self._script_type, self._script = a.get('type'), []
            if '/assets/index-' in a.get('src', ''):
                self.entry_bundles.append(a['src'])

    def handle_data(self, data):
        if self._capture:
            self._text.append(data)
        if self._script_type == 'application/ld+json':
            self._script.append(data)
        if not self._hidden:
            self.visible.append(data)

    def handle_endtag(self, tag):
        if tag == 'head':
            self._in_head = False
        if tag == self._capture:
            value = compact(' '.join(self._text))
            if tag == 'title':
                self.title.append(value)
            elif tag == 'h1':
                self.h1.append(value)
            else:
                self.headings.append({'level': tag, 'text': value})
            self._capture = None
        if tag == 'script':
            if self._script_type == 'application/ld+json':
                try:
                    self.schemas.append(json.loads(''.join(self._script)))
                except (ValueError, TypeError):
                    self.schemas.append({'parseError': True})
            self._script_type = None
        if tag in ('script', 'style'):
            self._hidden = max(0, self._hidden - 1)

    def summary(self):
        types, main = Counter(), []

        def walk(value, top=False):
            if isinstance(value, list):
                for child in value:
                    walk(child, top)
            elif isinstance(value, dict):
                for kind in ([value['@type']] if isinstance(value.get('@type'), str) else value.get('@type', [])):
                    types[kind] += 1
                if top and '@type' in value:
                    item = {key: value[key] for key in ['@type', '@id', 'name', 'headline', 'url', 'inLanguage', 'datePublished', 'dateModified'] if key in value}
                    if isinstance(value.get('author'), dict):
                        item['author'] = {key: value['author'][key] for key in ['@type', 'name'] if key in value['author']}
                    main.append(item)
                for key, child in value.items():
                    if isinstance(child, (dict, list)):
                        walk(child, top=(key == '@graph'))

        for schema in self.schemas:
            walk(schema, top=True)
        text = compact(' '.join(self.visible))
        return {
            'html_lang': self.html_lang, 'title': self.title, 'h1': self.h1,
            'canonical': self.canonical, 'meta': self.meta,
            'hreflang': sorted(self.alternates, key=lambda a: a['language']),
            'headings': self.headings[:30], 'visible_text_chars': len(text),
            'content_markers': {key: value.casefold() in text.casefold() for key, value in MARKERS.items()},
            'schema': {'blocks': len(self.schemas), 'parse_errors': sum(s.get('parseError', False) for s in self.schemas if isinstance(s, dict)), 'types': dict(types), 'main_entities': main},
            'entry_bundles': self.entry_bundles,
        }


def routes(language, exemplar):
    return [f'/{language}', f'/{language}/destinations', f'/{language}/blog',
            *[f'/{language}/destinations/{slug}' for slug in DESTINATIONS],
            *[f'/{language}/blog/{slug}' for slug in GUIDES], f'/{language}/homes/{exemplar}']


def audit(base, route, expected_paths, timeout):
    url = base + route
    with tempfile.TemporaryDirectory(prefix='pa-editorial-headers-') as temporary:
        headers_file = Path(temporary) / 'headers.txt'
        result = subprocess.run([
            'curl', '--silent', '--show-error', '--location', '--compressed',
            '--max-time', str(timeout), '--max-filesize', '8000000',
            '--user-agent', UA, '--dump-header', str(headers_file),
            '--write-out', '\n__PA_AUDIT_META__%{json}', url,
        ], capture_output=True)
        payload, _, metadata = result.stdout.rpartition(b'\n__PA_AUDIT_META__')
        try:
            request_meta = json.loads(metadata)
        except ValueError:
            request_meta = {}
        header_text = headers_file.read_text(errors='replace') if headers_file.exists() else ''
    last = {}
    statuses = []
    for line in header_text.splitlines():
        if line.startswith('HTTP/'):
            statuses.append(line.split(' ', 2)[1])
            last = {}
        elif ':' in line:
            key, value = line.split(':', 1)
            last[key.lower()] = value.strip()
    row = {
        'path': route, 'requested_url': url, 'status': request_meta.get('http_code'),
        'effective_url': request_meta.get('url_effective'), 'redirect_statuses': statuses,
        'redirect_count': request_meta.get('num_redirects'), 'bytes': len(payload),
        'body_sha256': hashlib.sha256(payload).hexdigest(),
        'response_headers': {key: last[key] for key in ['content-type', 'x-robots-tag', 'cache-control', 'cf-cache-status', 'age', 'location'] if key in last},
    }
    if result.returncode:
        row['request_error'] = result.stderr.decode(errors='replace')[:400]
    body = payload.decode('utf-8', errors='replace')
    if route == '/robots.txt':
        directives = [line.strip() for line in body.splitlines() if line.strip() and not line.lstrip().startswith('#')]
        row['robots_directives'] = directives if row['status'] == 200 and '<html' not in body.lower() else []
    elif route == '/sitemap.xml':
        try:
            xml = ET.fromstring(body)
            locations = [node.text or '' for node in xml.findall('.//{*}loc')]
            paths = {urlsplit(location).path for location in locations}
            row['sitemap'] = {
                'root': xml.tag.split('}')[-1], 'url_count': len(locations),
                'language_counts': dict(Counter(urlsplit(location).path.split('/')[1] for location in locations if len(urlsplit(location).path.split('/')) > 1)),
                'expected_route_presence': {route: route in paths for route in expected_paths},
                'legacy_journal_count': sum('/journal/' in p for p in paths),
                'draft_brazil_count': sum('/destinations/brazil' in p for p in paths),
            }
        except ET.ParseError:
            row['sitemap'] = {'parse_error': True}
    else:
        page = PageSummary()
        page.feed(body)
        row.update(page.summary())
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='https://www.portugalactive.com')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--compare', type=Path)
    parser.add_argument('--exemplar', default=EXEMPLAR)
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--timeout', type=int, default=25)
    args = parser.parse_args()
    base = args.base.rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password or parsed.query:
        parser.error('Use a public or local HTTP base without credentials or query parameters.')
    catalog = json.loads((ROOT / 'client/src/data/properties.json').read_text())
    catalog = catalog if isinstance(catalog, list) else catalog['properties']
    if not any(home.get('slug') == args.exemplar for home in catalog):
        parser.error('The property exemplar must exist in the local public catalog.')
    paths = ['/', *routes('en', args.exemplar), *routes('pt', args.exemplar),
             '/journal/viana-do-castelo-guide', '/journal/when-to-visit-north-portugal',
             '/index.php', '/en/destinations/brazil', '/robots.txt', '/sitemap.xml']
    expected = [p for language in LANGUAGES for p in routes(language, args.exemplar)]
    started = datetime.now(timezone.utc).isoformat()
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 5))) as pool:
        rows = list(pool.map(lambda route: audit(base, route, expected, args.timeout), paths))
    report = {'started_at': started, 'completed_at': datetime.now(timezone.utc).isoformat(),
              'base': base, 'method': 'GET; curl with Mozilla user agent; no JavaScript, credentials, booking or availability APIs',
              'user_agent': UA, 'preserved_languages': LANGUAGES, 'property_exemplar': args.exemplar,
              'pages': rows}
    if args.compare:
        before = {row['path']: row for row in json.loads(args.compare.read_text())['pages']}
        keys = ['status', 'title', 'h1', 'canonical', 'meta', 'hreflang', 'content_markers', 'schema', 'robots_directives', 'sitemap']
        report['comparison'] = [{'path': row['path'], 'changed_fields': [key for key in keys if before.get(row['path'], {}).get(key) != row.get(key)]} for row in rows]
        report['compared_with'] = str(args.compare)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'pages': len(rows), 'statuses': dict(Counter(str(row['status']) for row in rows)), 'request_errors': sum('request_error' in row for row in rows)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
