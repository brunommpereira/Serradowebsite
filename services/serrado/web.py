"""Peças comuns às duas APIs: erros no formato {error, message}, validação e limite de tamanho dos pedidos."""

import logging
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger("serrado")

MiB = 1024 * 1024


class HttpError(Exception):
    """Erro com significado para quem chama a API: estado HTTP, código e mensagem."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def not_found(what: str = "Recurso") -> HttpError:
    return HttpError(404, "not_found", f"{what} não encontrado")


def forbidden() -> HttpError:
    return HttpError(403, "forbidden", "Sem permissão para esta operação")


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": code, "message": message}, status_code=status)


def _validation_message(exc: RequestValidationError) -> str:
    parts = []
    for e in exc.errors()[:3]:
        where = "/".join(str(p) for p in e.get("loc", ()) if p not in ("body",)) or "body"
        parts.append(f"{where}: {e.get('msg', 'inválido')}")
    return "; ".join(parts) or "Pedido inválido"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HttpError)
    async def _http_error(_req: Request, exc: HttpError) -> JSONResponse:
        return error(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(_req: Request, exc: RequestValidationError) -> JSONResponse:
        return error(400, "validation", _validation_message(exc))

    @app.exception_handler(404)
    async def _not_found(req: Request, _exc: Exception) -> JSONResponse:
        detail = getattr(_exc, "detail", None)
        if isinstance(detail, str) and detail != "Not Found":
            return error(404, "not_found", detail)
        return error(404, "not_found", f"Rota {req.method}:{req.url.path} não encontrada")

    @app.exception_handler(405)
    async def _not_allowed(req: Request, _exc: Exception) -> JSONResponse:
        return error(405, "method_not_allowed", f"Método {req.method} não permitido em {req.url.path}")

    @app.exception_handler(Exception)
    async def _internal(req: Request, exc: Exception) -> JSONResponse:
        log.exception("erro em %s %s", req.method, req.url.path, exc_info=exc)
        return error(500, "internal", "Erro interno")


class BodyLimit:
    """Recusa (413) pedidos maiores do que o limite da rota (1 MiB por omissão)."""

    def __init__(self, app: ASGIApp, limit_for: Callable[[str, str], int]) -> None:
        self.app = app
        self.limit_for = limit_for

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.limit_for(scope["method"], scope["path"])
        headers = dict(scope.get("headers") or [])
        length = headers.get(b"content-length")
        if length is not None and length.isdigit() and int(length) > limit:
            await _too_large(send)
            return
        received = 0
        too_large = False

        async def limited_receive() -> Message:
            nonlocal received, too_large
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    too_large = True
                    raise _BodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await _too_large(send)


class _BodyTooLarge(Exception):
    pass


async def _too_large(send: Send) -> None:
    resp = JSONResponse({"error": "too_large", "message": "O pedido é demasiado grande"}, status_code=413)
    await resp({"type": "http"}, _empty_receive, send)  # type: ignore[arg-type]


async def _empty_receive() -> dict[str, Any]:
    return {"type": "http.disconnect"}
