"""Odsiew w kodzie: e-maile, domeny, portale, słowa wykluczające. Kogo szukać
(np. czy szkoły), decyduje kategoria z panelu i jej opis — nie kod.

Domeny porównywane dokładnie (domena albo jej poddomena), nigdy jako podciąg —
w starym systemie `mail.com` wycinało wszystkie adresy `@gmail.com`.
"""

import html
import re
from urllib.parse import urlparse

from .config import load_lines

EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}')
# Zapisy chroniące adres przed robotami: "biuro [at] firma [dot] pl", "(małpa)".
_AT_RE = re.compile(r'\s*[\[\(\{<]\s*(?:at|małpa|malpa)\s*[\]\)\}>]\s*', re.IGNORECASE)
_DOT_RE = re.compile(r'\s*[\[\(\{<]\s*(?:dot|kropka)\s*[\]\)\}>]\s*', re.IGNORECASE)
_CFEMAIL_RE = re.compile(r'data-cfemail="([0-9a-fA-F]+)"|/cdn-cgi/l/email-protection#([0-9a-fA-F]+)')

BLOCKED_DOMAINS = {d.lower() for d in load_lines('blocked_domains.txt')}
GARBAGE_EMAIL_DOMAINS = {d.lower() for d in load_lines('garbage_email_domains.txt')}
JUNK_EMAIL_PREFIXES = tuple(p.lower() for p in load_lines('junk_email_prefixes.txt'))
IGNORED_EXTENSIONS = tuple(e.lower() for e in load_lines('ignored_extensions.txt'))
NEGATIVE_KEYWORDS = [k.lower() for k in load_lines('negative_keywords.txt')]
PORTAL_DOMAINS = {d.lower() for d in load_lines('portal_domains.txt')}

# Poczta ogólna — adres na niej jest w porządku, ale nie mówi nic o firmie.
FREEMAIL_DOMAINS = {
    'gmail.com', 'googlemail.com', 'wp.pl', 'o2.pl', 'interia.pl', 'interia.eu', 'onet.pl', 'onet.eu',
    'op.pl', 'poczta.onet.pl', 'vp.pl', 'tlen.pl', 'gazeta.pl', 'outlook.com', 'hotmail.com', 'live.com',
    'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'poczta.fm', 'buziaczek.pl', 'autograf.pl',
}

def norm_domain(host):
    host = (host or '').strip().lower().rstrip('.')
    if host.startswith('www.'):
        host = host[4:]
    return host


def url_domain(url):
    try:
        return norm_domain(urlparse(url).hostname or '')
    except ValueError:
        return ''


def domain_in(domain, domains):
    """Domena jest na liście albo jest poddomeną domeny z listy."""
    domain = norm_domain(domain)
    if not domain:
        return False
    parts = domain.split('.')
    return any('.'.join(parts[i:]) in domains for i in range(len(parts) - 1))


def decode_cfemail(hexstr):
    try:
        data = bytes.fromhex(hexstr)
        key = data[0]
        return ''.join(chr(b ^ key) for b in data[1:])
    except (ValueError, IndexError):
        return ''


def deobfuscate(text):
    text = html.unescape(text or '')
    text = _AT_RE.sub('@', text)
    return _DOT_RE.sub('.', text)


def email_ok(email):
    email = (email or '').strip().lower().strip('.')
    if not EMAIL_RE.fullmatch(email):
        return False
    local, _, dom = email.rpartition('@')
    if any(email.endswith(x) for x in IGNORED_EXTENSIONS):
        return False
    if email.startswith(JUNK_EMAIL_PREFIXES) or len(local) > 64:
        return False
    # Bez BLOCKED_DOMAINS: tam są portale stron (np. wp.pl), a adresy
    # @wp.pl, @interia.pl to zwykła poczta małych firm.
    if domain_in(dom, GARBAGE_EMAIL_DOMAINS):
        return False
    return True


def extract_emails(text, raw_html=''):
    """Adresy z tekstu (z zapisami [at]) i z HTML (mailto, ochrona Cloudflare)."""
    found = []
    sources = [deobfuscate(text)]
    if raw_html:
        sources.append(html.unescape(raw_html))
        for a, b in _CFEMAIL_RE.findall(raw_html):
            sources.append(decode_cfemail(a or b))
    for src in sources:
        for e in EMAIL_RE.findall(src):
            e = e.strip('.').lower()
            if email_ok(e) and e not in found:
                found.append(e)
    return found


def best_email(emails, site_domain=''):
    """Adres z domeny strony, potem firmowy, potem poczta ogólna."""
    site_domain = norm_domain(site_domain)

    def rank(e):
        dom = e.rpartition('@')[2]
        if site_domain and (dom == site_domain or dom.endswith('.' + site_domain)):
            return 0
        return 2 if dom in FREEMAIL_DOMAINS else 1
    ok = [e for e in emails if email_ok(e)]
    return sorted(ok, key=rank)[0] if ok else None


def has_keyword(text, keywords):
    low = (text or '').lower()
    return next((k for k in keywords if k in low), None)


def rule_reason(url='', name='', snippet='', emails=()):
    """Odsiew przed AI. Zwraca powód albo None, gdy kandydat przechodzi."""
    domain = url_domain(url) if url else ''
    if url and any(url.lower().split('?')[0].endswith(x) for x in IGNORED_EXTENSIONS):
        return 'plik, nie strona'
    if domain and domain_in(domain, BLOCKED_DOMAINS):
        return f'domena zablokowana ({domain})'
    kw = has_keyword(f'{name} {snippet}', NEGATIVE_KEYWORDS)
    if kw:
        return f'słowo wykluczające ({kw})'
    return None


def is_portal(domain):
    return domain_in(domain, PORTAL_DOMAINS)
