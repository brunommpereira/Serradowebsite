"""Validações de negócio partilhadas (as mesmas regras do front)."""

import re
from dataclasses import dataclass
from datetime import date


def is_valid_nif(nif: str) -> bool:
    """NIF português: 9 dígitos com dígito de controlo (módulo 11)."""
    if not re.fullmatch(r"[1235689]\d{8}", nif):
        return False
    total = sum(int(d) * (9 - i) for i, d in enumerate(nif[:8]))
    check = 11 - (total % 11)
    return int(nif[8]) == (0 if check >= 10 else check)


def is_valid_id_number(v: str) -> bool:
    return re.fullmatch(r"\d{7,8}", v) is not None


def is_valid_postal_code(v: str) -> bool:
    return re.fullmatch(r"\d{4}-\d{3}", v) is not None


def is_valid_phone(v: str) -> bool:
    return re.fullmatch(r"(9\d{8}|2\d{8}|\+\d{8,15})", re.sub(r"\s", "", v)) is not None


@dataclass
class Season:
    label: str
    start: str


def current_season(ref: date | None = None) -> Season:
    """Época desportiva em curso (começa a 1 de setembro)."""
    ref = ref or date.today()
    y = ref.year if ref.month >= 9 else ref.year - 1
    return Season(label=f"{y}/{str(y + 1)[2:]}", start=f"{y}-09-01")
