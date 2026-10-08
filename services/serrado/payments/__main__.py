"""
Tarefas dos pagamentos no servidor (timers do systemd):

    python -m serrado.payments receipts                 # emite as faturas-recibo em falta (Moloni ON)
    python -m serrado.payments generate-fees [AAAA-MM]  # cria as mensalidades do mês (omissão: mês atual)
    python -m serrado.payments moloni-info              # empresas, séries, artigos e métodos de pagamento (para configurar)
"""

import asyncio
import json
import logging
import sys
from datetime import date

from ..config import config
from ..db.pool import create_pool
from .moloni import MoloniClient
from .service import generate_fees, issue_receipts


async def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s %(message)s")
    command = argv[0] if argv else ""
    pool = create_pool(max_size=2)
    await pool.open()
    try:
        if command == "receipts":
            if not config.payments.receipts_enabled:
                print("Moloni não configurado: nada a fazer.")
                return 0
            s = await issue_receipts(pool, config.payments, MoloniClient(config.payments))
            print(json.dumps(s.__dict__, ensure_ascii=False))
            return 1 if s.errors else 0
        if command == "moloni-info":
            info = await MoloniClient(config.payments).info()
            print(json.dumps(info, ensure_ascii=False, indent=2))
            return 0
        if command == "generate-fees":
            month = date.fromisoformat(argv[1] + "-01") if len(argv) > 1 else date.today().replace(day=1)
            async with pool.connection() as c:
                created = await generate_fees(c, month)
            print(f"✔ {created} mensalidades criadas para {month:%Y-%m}")
            return 0
        print(__doc__, file=sys.stderr)
        return 2
    finally:
        await pool.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
