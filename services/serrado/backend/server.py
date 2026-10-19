"""Arranque do backend: python -m serrado.backend.server"""

import asyncio
import logging

import uvicorn

from ..config import config
from ..db.pool import create_pool
from ..push import worker
from .app import build_backend


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    pool = create_pool()
    await pool.open()
    # Envio das notificações push em segundo plano (fila push_outbox)
    sender = asyncio.create_task(worker(pool))
    try:
        app = build_backend(pool)
        server = uvicorn.Server(
            uvicorn.Config(app, host=config.host, port=config.backend_port, proxy_headers=False, server_header=False, log_level="info")
        )
        await server.serve()
    finally:
        sender.cancel()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
