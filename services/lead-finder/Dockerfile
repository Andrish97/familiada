FROM python:3.12-slim

WORKDIR /app

# 1. Instalacja zależności systemowych (RZADKO się zmieniają)
# Przenosimy to na początek, żeby nie powtarzać przy każdej zmianie kodu/pip
RUN apt-get update && apt-get install -y --no-install-recommends \
        libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
        libcups2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libasound2 fonts-unifont curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Instalacja Playwright i przeglądarki (RZADKO)
# Instalujemy samą paczkę i binarkę chromium w osobnych krokach dla lepszego cache
RUN pip install --no-cache-dir playwright==1.52.0
RUN playwright install chromium

# 3. Instalacja pozostałych zależności Pythona (CZĘŚCIEJ niż system)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Kopiowanie plików konfiguracyjnych (Rzadziej niż kod)
COPY *.txt ./
# Usuwamy requirements.txt z tej kopii jeśli już skopiowano wcześniej
RUN rm -f requirements.txt

# 5. Kopiowanie kodu aplikacji (NAJCZĘŚCIEJ)
COPY main.py .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
