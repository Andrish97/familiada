# Używamy oficjalnego obrazu Playwright, który ma już zainstalowane przeglądarki i pakiety systemowe
FROM mcr.microsoft.com/playwright/python:v1.52.0-jammy

WORKDIR /app

# Zapobieganie interaktywnym pytaniom
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# 1. Pip: Narzędzia instalacyjne
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# 2. Zależności Pythona: Kopiujemy i instalujemy
# requirements.txt zawiera już playwright==1.52.0, więc pip to sprawdzi
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Pliki pomocnicze (rzadko się zmieniają)
COPY *.txt ./
RUN rm -f requirements.txt

# 4. Kod aplikacji (zmienia się najczęściej)
COPY main.py .

EXPOSE 8001

# W tym obrazie przeglądarki są już w /ms-playwright, więc nie trzeba ich instalować
# Ale dla pewności sprawdzamy czy są dostępne dla użytkownika
RUN playwright install chromium

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
