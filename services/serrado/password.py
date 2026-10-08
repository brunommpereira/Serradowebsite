"""Passwords com scrypt e salt aleatório: «scrypt$N$r$p$salt$hash» (base64)."""

import asyncio
import base64
import hashlib
import hmac
import os

N, R, P, LEN = 16384, 8, 1, 64
_MAXMEM = 64 * 1024 * 1024


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int, length: int) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, maxmem=_MAXMEM, dklen=length)


def hash_password_sync(password: str) -> str:
    salt = os.urandom(16)
    digest = _scrypt(password, salt, N, R, P, LEN)
    return "$".join(["scrypt", str(N), str(R), str(P), base64.b64encode(salt).decode(), base64.b64encode(digest).decode()])


def verify_password_sync(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 6 or parts[0] != "scrypt" or not parts[4] or not parts[5]:
        return False
    try:
        n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
        expected = base64.b64decode(parts[5])
        actual = _scrypt(password, base64.b64decode(parts[4]), n, r, p, len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


async def hash_password(password: str) -> str:
    """O scrypt é pesado de propósito: corre fora do ciclo de eventos."""
    return await asyncio.to_thread(hash_password_sync, password)


async def verify_password(password: str, stored: str) -> bool:
    return await asyncio.to_thread(verify_password_sync, password, stored)


# Hash fixo usado quando a conta não existe, para o login demorar o mesmo tempo.
DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + base64.b64encode(bytes(64)).decode()
