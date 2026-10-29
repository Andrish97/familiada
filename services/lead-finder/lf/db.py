"""Supabase REST (klucz serwisowy)."""

import logging

import httpx
from .logging_sink import describe_error

log = logging.getLogger('lead_finder')


class Supabase:
    def __init__(self, url, key, client=None):
        self.url = url.rstrip('/')
        self.client = client or httpx.AsyncClient(timeout=30, headers={
            'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
        })

    async def select(self, table, params):
        try:
            r = await self.client.get(f'{self.url}/rest/v1/{table}', params=params)
            if r.status_code == 200:
                return r.json()
            log.error(f'DB select {table}: {r.status_code} {r.text[:200]}')
        except httpx.HTTPError as e:
            log.error(f'DB select {table}: {describe_error(e)}')
        return None

    async def select_all(self, table, columns, page=1000, extra=None):
        rows, offset = [], 0
        while True:
            params = {'select': columns, 'limit': page, 'offset': offset, 'order': 'id'}
            params.update(extra or {})
            chunk = await self.select(table, params)
            if chunk is None:
                return None
            rows.extend(chunk)
            if len(chunk) < page:
                return rows
            offset += page

    async def insert(self, table, data, upsert_on=None, ignore_duplicates=False):
        headers = {'Prefer': 'return=representation'}
        params = {}
        if upsert_on:
            params['on_conflict'] = upsert_on
            headers['Prefer'] += ',resolution=' + ('ignore-duplicates' if ignore_duplicates else 'merge-duplicates')
        try:
            r = await self.client.post(f'{self.url}/rest/v1/{table}', json=data, params=params, headers=headers)
            if r.status_code in (200, 201):
                return r.json()
            log.error(f'DB insert {table}: {r.status_code} {r.text[:200]}')
        except httpx.HTTPError as e:
            log.error(f'DB insert {table}: {describe_error(e)}')
        return None

    async def update(self, table, data, filters):
        try:
            r = await self.client.patch(f'{self.url}/rest/v1/{table}', json=data, params=filters)
            if r.status_code in (200, 204):
                return True
            log.error(f'DB update {table}: {r.status_code} {r.text[:200]}')
        except httpx.HTTPError as e:
            log.error(f'DB update {table}: {describe_error(e)}')
        return False

    async def delete(self, table, filters):
        try:
            r = await self.client.delete(f'{self.url}/rest/v1/{table}', params=filters)
            return r.status_code in (200, 204)
        except httpx.HTTPError:
            return False

    async def rpc(self, fn, params=None):
        try:
            r = await self.client.post(f'{self.url}/rest/v1/rpc/{fn}', json=params or {})
            if r.status_code in (200, 201):
                return r.json()
            if r.status_code == 204:
                return True
            log.error(f'DB rpc {fn}: {r.status_code} {r.text[:200]}')
        except httpx.HTTPError as e:
            log.error(f'DB rpc {fn}: {describe_error(e)}')
        return None
