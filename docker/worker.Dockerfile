FROM python:3.13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /srv
COPY services/api ./api
COPY services/worker ./worker
WORKDIR /srv/worker
RUN uv sync --frozen --no-dev --no-editable

ENV PATH="/srv/worker/.venv/bin:$PATH" \
    TORCH_HOME=/srv/models

RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

CMD ["python", "-m", "worker.run"]
