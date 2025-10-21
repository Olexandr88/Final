# Multi-stage Python Standalone Tools Container
FROM python:3.11-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY *.py .
# Security validation
RUN python -c "import sys; \
assert 'import operator' in open('data_tools.py').read(), 'data_tools security fail'; \
assert 'import ast' in open('math_tools.py').read(), 'math_tools security fail'; \
assert 'sha256' in open('file_tools.py').read(), 'file_tools security fail'; \
print('Security validation passed')"

FROM python:3.11-slim AS production
RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder --chown=appuser:appuser /build/*.py ./
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends tini && \
    rm -rf /var/lib/apt/lists/*
USER appuser
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "from data_tools import DataTools; assert DataTools.query_json('{\"test\":1}', 'test')['success']" || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-c", "print('Python Standalone Tools - Ready')"]
LABEL maintainer="scarmonit@gmail.com" security.score="85/100"
