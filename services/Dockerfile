# Imagem única para os serviços (middleware e backend): o comando decide qual corre.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project && rm /usr/local/bin/uv
COPY serrado ./serrado
ENV PATH="/app/.venv/bin:$PATH"
USER nobody
# Por omissão corre o middleware; o docker-compose define o comando de cada serviço
CMD ["python", "-m", "serrado.middleware.server"]
