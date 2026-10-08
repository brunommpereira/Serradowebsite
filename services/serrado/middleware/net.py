"""IP real do visitante (atrás de proxies de confiança) e limite de pedidos por IP."""

import ipaddress
import time
from collections.abc import Callable

Trust = Callable[[str, int], bool]

_NAMED = {
    "loopback": ["127.0.0.1/8", "::1/128"],
    "linklocal": ["169.254.0.0/16", "fe80::/10"],
    "uniquelocal": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"],
}


def compile_trust(value: str) -> Trust:
    """
    Igual ao trustProxy do Fastify (proxy-addr): «true» (confia em todos), «false», um n.º de saltos,
    ou uma lista separada por vírgulas de redes (CIDR), IPs ou nomes (loopback, linklocal, uniquelocal).
    """
    v = value.strip().lower()
    if v in ("true", "1", "yes"):
        return lambda _a, _i: True
    if v in ("false", "0", "no", ""):
        return lambda _a, _i: False
    if v.isdigit():
        hops = int(v)
        return lambda _a, i: i < hops
    nets: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for item in (s.strip() for s in v.split(",") if s.strip()):
        for cidr in _NAMED.get(item, [item]):
            nets.append(ipaddress.ip_network(cidr, strict=False))

    def trusted(addr: str, _i: int) -> bool:
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        return any(ip.version == n.version and ip in n for n in nets)

    return trusted


def client_ip(peer: str, forwarded_for: str | None, trust: Trust) -> str:
    """Do ligado diretamente para trás (X-Forwarded-For), o primeiro endereço em que não se confia."""
    addrs = [peer]
    if forwarded_for:
        addrs += [a.strip() for a in reversed(forwarded_for.split(",")) if a.strip()]
    for i in range(len(addrs) - 1):
        if not trust(addrs[i], i):
            return addrs[i]
    return addrs[-1]


class RateLimiter:
    """Janela fixa de 1 minuto por (grupo, IP), em memória (um só processo)."""

    def __init__(self, window_seconds: float = 60) -> None:
        self.window = window_seconds
        self.hits: dict[tuple[str, str], tuple[float, int]] = {}
        self._last_prune = time.monotonic()

    def allow(self, bucket: str, ip: str, limit: int) -> bool:
        now = time.monotonic()
        if now - self._last_prune > self.window:
            self.hits = {k: v for k, v in self.hits.items() if now - v[0] < self.window}
            self._last_prune = now
        start, count = self.hits.get((bucket, ip), (now, 0))
        if now - start >= self.window:
            start, count = now, 0
        count += 1
        self.hits[(bucket, ip)] = (start, count)
        return count <= limit
