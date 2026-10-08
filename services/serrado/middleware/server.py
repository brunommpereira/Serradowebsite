"""Arranque do middleware: python -m serrado.middleware.server"""

import logging

import uvicorn

from ..config import config
from .app import build_middleware


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    # O IP real do visitante é resolvido pela app (TRUST_PROXY), não pelo uvicorn
    uvicorn.run(build_middleware(), host=config.host, port=config.middleware_port, proxy_headers=False, server_header=False, log_level="info")


if __name__ == "__main__":
    main()
