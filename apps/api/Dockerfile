# Crede API — Debian bookworm so WeasyPrint gets a modern Pango + the CV fonts.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    STORAGE_ROOT=/data/crede

WORKDIR /app

# WeasyPrint runtime libs + fonts used by the six CV templates (Inter, Lato, EB Garamond,
# Open Sans, Carlito ≈ Calibri, Liberation ≈ Times/Arial). No compilers needed (binary wheels).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libharfbuzz-subset0 libfontconfig1 \
      shared-mime-info fontconfig \
      fonts-inter fonts-lato fonts-ebgaramond fonts-open-sans fonts-crosextra-carlito fonts-liberation2 fonts-dejavu-core \
      curl \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app/ ./app/
COPY scripts/ ./scripts/
COPY seed_data.py .
COPY data/ ./data/

RUN useradd -m -u 1000 appuser \
    && mkdir -p /data/crede \
    && chown -R appuser:appuser /app /data/crede

USER appuser
EXPOSE 8008

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8008/health || exit 1

# Schema is created / lightly migrated on startup (see app/main.py lifespan).
# One worker keeps memory low on a small VPS; raise WEB_CONCURRENCY if you have headroom.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8008 --workers ${WEB_CONCURRENCY:-1} --proxy-headers --forwarded-allow-ips='*'"]
