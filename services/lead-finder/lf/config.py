"""Konfiguracja z plików .txt obok kodu (KLUCZ=WARTOŚĆ, listy po linii, # komentarz)."""

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _strip_comment(line):
    return line.split('#', 1)[0].strip()


def load_lines(filename):
    path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(path):
        return []
    with open(path, encoding='utf-8') as f:
        return [v for v in (_strip_comment(l) for l in f) if v]


def load_config(filename='config.txt'):
    config = {}
    for line in load_lines(filename):
        if '=' not in line:
            continue
        k, v = (x.strip() for x in line.split('=', 1))
        try:
            config[k] = int(v)
        except ValueError:
            config[k] = v
    return config


def load_text(filename):
    path = os.path.join(BASE_DIR, filename)
    with open(path, encoding='utf-8') as f:
        return '\n'.join(l.rstrip('\n') for l in f if not l.lstrip().startswith('#')).strip()


CONFIG = load_config()


def cfg(key, default):
    return CONFIG.get(key, default)
