# Lead Finder 2 — bez przeglądarki (kontakty z gotowych danych), mały obraz.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.txt ./
# Parametry /app/config.txt montuje Compose z prywatnego familijna-server.
RUN rm -f requirements.txt
COPY lf ./lf
COPY main.py .

RUN useradd --uid 10002 --no-create-home --shell /usr/sbin/nologin leadfinder
USER 10002:10002

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health',timeout=2).read()"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
