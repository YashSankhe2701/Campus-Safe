# CAMPUS-SAFE FastAPI Backend Container
FROM python:3.11-slim

WORKDIR /app

# Ensure non-buffered stdout/stderr logging and skip pyc files
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    EVACUATION_MODEL_PATH=/app/artifacts/evacuation_time_rf.joblib

# Install curl for container health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY app/ ./app/

# Copy existing trained model artifact into container artifacts directory
COPY artifacts/ /app/artifacts/

EXPOSE 8000

# Container healthcheck using public health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Launch uvicorn listening on all interfaces
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
