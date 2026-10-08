"""Cache em memória com expiração (conteúdo público). Invalidada quando o CMS publica."""

import time
from collections.abc import Awaitable, Callable
from typing import Any


class TtlCache:
    def __init__(self, ttl_seconds: float = 60) -> None:
        self.ttl = ttl_seconds
        self.store: dict[str, tuple[float, Any]] = {}

    async def get(self, key: str, load: Callable[[], Awaitable[Any]]) -> Any:
        hit = self.store.get(key)
        if hit and time.monotonic() - hit[0] < self.ttl:
            return hit[1]
        value = await load()
        self.store[key] = (time.monotonic(), value)
        return value

    def invalidate(self, prefix: str = "") -> None:
        """Apaga as entradas cujo nome começa pelo prefixo (ou tudo)."""
        for k in [k for k in self.store if k.startswith(prefix)]:
            del self.store[k]
