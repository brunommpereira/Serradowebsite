"""Gera openapi/backend.json e openapi/middleware.json a partir das rotas (sem base de dados).

python -m serrado.openapi
"""

import json
from pathlib import Path

from .backend.app import build_backend
from .db.pool import create_pool
from .middleware.app import build_middleware

OUT = Path(__file__).resolve().parents[1] / "openapi"


def main() -> None:
    OUT.mkdir(exist_ok=True)
    apps = {"backend": build_backend(create_pool("postgresql://localhost/nao-usada")), "middleware": build_middleware(oauth={})}
    for name, app in apps.items():
        spec = app.openapi()
        (OUT / f"{name}.json").write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"✔ openapi/{name}.json — {len(spec.get('paths', {}))} caminhos")


if __name__ == "__main__":
    main()
