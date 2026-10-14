FROM python:3.13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

WORKDIR /srv
COPY services/api ./api
COPY services/worker ./worker
WORKDIR /srv/worker
RUN uv sync --frozen --no-dev --no-editable

ENV PATH="/srv/worker/.venv/bin:$PATH" \
    TORCH_HOME=/srv/models

RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')"
RUN useradd --system --uid 10001 --create-home karaoki && mkdir -p /tmp/karaoki && chown -R karaoki /srv /tmp/karaoki
USER karaoki

CMD ["python", "-m", "worker.run"]
