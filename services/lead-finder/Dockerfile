FROM python:3.12-slim

WORKDIR /app

# Argument, który pozwala wymusić odświeżenie systemu przy budowaniu:
# docker build --build-arg UPDATE_DATE=$(date +%Y-%m-%d) ...
ARG UPDATE_DATE=2024-04-17

# 1. System: Instalujemy i czyścimy, aby obraz był lekki
RUN apt-get update && apt-get install -y --no-install-recommends \
        libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
        libcups2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libasound2 fonts-unifont curl \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# 2. Pip: Zawsze najnowszy instalator
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# 3. Zależności: Kopiujemy tylko requirements, żeby nie unieważniać cache kodem
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Playwright: Instalujemy przeglądarkę (wersja zależy od requirements.txt)
# Jeśli wersja w requirements.txt się zmieni, ta warstwa zostanie przebudowana automatycznie
RUN playwright install chromium && playwright install-deps chromium

# 5. Pliki pomocnicze
COPY *.txt ./
RUN rm -f requirements.txt

# 6. Kod aplikacji (zmienia się najczęściej)
COPY main.py .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
