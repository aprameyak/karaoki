FROM python:3.13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

WORKDIR /srv/api
COPY services/api/pyproject.toml services/api/uv.lock ./
COPY services/api/app ./app
RUN uv sync --frozen --no-dev --no-editable

ENV PATH="/srv/api/.venv/bin:$PATH"
RUN useradd --system --uid 10001 karaoki && chown -R karaoki /srv/api
USER karaoki
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
