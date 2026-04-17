FROM python:3.12-slim

WORKDIR /app

# Zapobieganie interaktywnym pytaniom podczas instalacji
ENV DEBIAN_FRONTEND=noninteractive

# 1. System: Podstawowe narzędzia (rzadko się zmieniają)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# 2. Pip: Narzędzia instalacyjne
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# 3. Zależności: Kopiujemy requirements.txt
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Playwright: Instalacja przeglądarki i zależności systemowych
# Musimy wywołać apt-get update, aby install-deps mogło pobrać pakiety
RUN apt-get update && \
    playwright install-deps chromium && \
    playwright install chromium && \
    rm -rf /var/lib/apt/lists/*

# 5. Pliki pomocnicze
COPY *.txt ./
RUN rm -f requirements.txt

# 6. Kod aplikacji
COPY main.py .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
