# syntax=docker/dockerfile:1
FROM python:3.12-slim
WORKDIR /app
COPY --chmod=0644 requirements.txt ./
RUN --mount=type=secret,id=proxy_ca,target=/run/proxy-ca.pem \
    if [ -f /run/proxy-ca.pem ]; then export PIP_CERT=/run/proxy-ca.pem; fi; \
    pip install --no-cache-dir -r requirements.txt
COPY --chmod=0644 model_spec.py download_model.py ./
RUN --mount=type=secret,id=proxy_ca,target=/run/proxy-ca.pem \
    if [ -f /run/proxy-ca.pem ]; then export REQUESTS_CA_BUNDLE=/run/proxy-ca.pem; fi; \
    HF_HUB_DISABLE_XET=1 python download_model.py /opt/model
COPY --chmod=0644 main.py ./
RUN chmod -R a+rX /opt/model && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin model
USER 10001:10001
ENV HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false MODEL_THREADS=1 MODEL_PATH=/opt/model OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8090/health',timeout=2).read()"
CMD ["python", "main.py"]
