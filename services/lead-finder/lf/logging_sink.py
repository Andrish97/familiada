"""Persistent, bounded diagnostic messages shared by the Lead Finder logger."""
import asyncio
import logging

import httpx


def describe_error(error):
    kind = type(error).__name__
    if isinstance(error, httpx.TimeoutException):
        return f'{kind}: przekroczono czas oczekiwania na usługę.'
    message = str(error).strip()
    return f'{kind}: {message}' if message else f'{kind}: wyjątek bez opisu.'


class DbLogHandler(logging.Handler):
    def __init__(self, db):
        super().__init__(logging.INFO)
        self.db = db

    def emit(self, record):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        # Błędy tabeli dziennika pozostają w stderr; pozostałe błędy DB
        # zapisujemy, żeby nie znikały z panelu. Bez pętli logowania.
        if record.getMessage().startswith('DB ') and 'marketing_search_logs:' in record.getMessage():
            return
        level = 'error' if record.levelno >= logging.ERROR else 'warning' if record.levelno >= logging.WARNING else 'info'
        loop.create_task(self._write({'level': level, 'message': self.format(record)[:16000]}))

    async def _write(self, row):
        try:
            await self.db.insert('marketing_search_logs', row)
        except Exception as error:
            logging.getLogger('lead_finder').error('DB insert marketing_search_logs: %s', describe_error(error))
