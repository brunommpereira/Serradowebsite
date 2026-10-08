"""
Cliente da API GraphQL do Moloni ON (https://api.molonion.pt/v1) com uma API Key
(«Authorization: Bearer apik:…», criada em Conta → API → API Keys).

Só o que o clube precisa: cliente por NIF, fatura-recibo fechada, envio por email e PDF.
"""

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import PaymentsConfig

API = "https://api.molonion.pt/v1"
MEDIA = "https://mediaapi.moloni.org"


class MoloniError(Exception):
    pass


@dataclass
class Document:
    document_id: int
    number: str  # ex.: «FR 2026/12»


@dataclass
class Line:
    product_id: int
    description: str
    price: float


class MoloniClient:
    def __init__(self, cfg: PaymentsConfig, transport: httpx.AsyncBaseTransport | None = None, media_url: str = MEDIA) -> None:
        self.cfg = cfg
        self.company = cfg.moloni_company_id
        self.media_url = media_url
        self.http = httpx.AsyncClient(transport=transport, timeout=30.0, headers={"authorization": f"Bearer {cfg.moloni_api_key}"})

    async def gql(self, query: str, variables: dict[str, Any], field: str) -> Any:
        """Corre uma operação e devolve data[field]. Erros do GraphQL ou do próprio campo → MoloniError."""
        try:
            res = await self.http.post(API, json={"query": query, "variables": variables})
        except httpx.HTTPError as e:
            raise MoloniError(f"sem ligação ao Moloni ({type(e).__name__})") from None
        if res.status_code >= 400:
            raise MoloniError(f"Moloni respondeu {res.status_code}")
        body = res.json()
        if body.get("errors"):
            raise MoloniError("; ".join(str(e.get("message")) for e in body["errors"])[:500])
        out = (body.get("data") or {}).get(field)
        if isinstance(out, dict) and out.get("errors"):
            raise MoloniError("; ".join(f"{e.get('field')}: {e.get('msg')}" for e in out["errors"])[:500])
        return out

    async def find_customer(self, vat: str) -> int | None:
        out = await self.gql(
            """query($companyId: Int!, $options: CustomerOptions) {
                 customers(companyId: $companyId, options: $options) { errors { field msg } data { customerId vat } }
               }""",
            {
                "companyId": self.company,
                "options": {"filter": [{"field": "vat", "comparison": "eq", "value": vat}], "pagination": {"page": 1, "qty": 1}},
            },
            "customers",
        )
        rows = (out or {}).get("data") or []
        return int(rows[0]["customerId"]) if rows else None

    async def create_customer(self, *, vat: str, name: str, email: str) -> int:
        out = await self.gql(
            """mutation($companyId: Int!, $data: CustomerInsert!) {
                 customerCreate(companyId: $companyId, data: $data) { errors { field msg } data { customerId } }
               }""",
            {
                "companyId": self.company,
                "data": {
                    "vat": vat,
                    "number": f"SFC-{vat}",
                    "name": name,
                    "email": email,
                    "countryId": self.cfg.moloni_country_id,
                    "languageId": self.cfg.moloni_language_id,
                },
            },
            "customerCreate",
        )
        return int(out["data"]["customerId"])

    async def customer_for(self, *, vat: str, name: str, email: str) -> int:
        return await self.find_customer(vat) or await self.create_customer(vat=vat, name=name, email=email)

    async def create_invoice_receipt(
        self, *, customer_id: int, lines: list[Line], payment_method_id: int | None, date: str, reference: str
    ) -> Document:
        """Fatura-recibo FECHADA (status 1): numerada, comunicada à AT e já liquidada pelo pagamento online."""
        total = round(sum(line.price for line in lines), 2)
        out = await self.gql(
            """mutation($companyId: Int!, $data: InvoiceReceiptInsert!) {
                 invoiceReceiptCreate(companyId: $companyId, data: $data) {
                   errors { field msg }
                   data { documentId number documentSetName totalValue }
                 }
               }""",
            {
                "companyId": self.company,
                "data": {
                    "documentSetId": self.cfg.moloni_document_set_id,
                    "customerId": customer_id,
                    "date": date,
                    "status": 1,
                    "ourReference": reference,
                    "products": [
                        {"productId": line.product_id, "ordering": i + 1, "qty": 1, "price": line.price, "summary": line.description}
                        for i, line in enumerate(lines)
                    ],
                    "payments": [{**({"paymentMethodId": payment_method_id} if payment_method_id else {}), "value": total, "date": date}],
                },
            },
            "invoiceReceiptCreate",
        )
        data = out["data"]
        number = f"{data.get('documentSetName') or 'FR'}/{data.get('number')}"
        return Document(document_id=int(data["documentId"]), number=number)

    async def send_mail(self, document_id: int, *, name: str, email: str) -> None:
        ok = await self.gql(
            """mutation($companyId: Int!, $documents: [Int]!, $mailData: MailData) {
                 invoiceReceiptSendMail(companyId: $companyId, documents: $documents, mailData: $mailData)
               }""",
            {"companyId": self.company, "documents": [document_id], "mailData": {"to": {"name": name, "email": email}, "attachment": True}},
            "invoiceReceiptSendMail",
        )
        if ok is not True:
            raise MoloniError("o Moloni não aceitou o envio do email")

    async def pdf(self, document_id: int, attempts: int = 10, wait: float = 1.0) -> tuple[str, bytes]:
        """Gera o PDF e descarrega-o (o token de download só dura ~10 s: usa-se logo)."""
        await self.gql(
            "mutation($companyId: Int!, $documentId: Int!) { invoiceReceiptGetPDF(companyId: $companyId, documentId: $documentId) }",
            {"companyId": self.company, "documentId": document_id},
            "invoiceReceiptGetPDF",
        )
        for _ in range(attempts):
            try:
                out = await self.gql(
                    "query($documentId: Int!) { invoiceReceiptGetPDFToken(documentId: $documentId) { errors { field msg } data { token path filename } } }",
                    {"documentId": document_id},
                    "invoiceReceiptGetPDFToken",
                )
            except MoloniError:
                out = None  # ainda a gerar
            token = (out or {}).get("data") if out else None
            if token and token.get("token"):
                res = await self.http.get(f"{self.media_url}{token['path']}", params={"jwt": token["token"]})
                if res.status_code == 200 and res.content.startswith(b"%PDF"):
                    return str(token.get("filename") or f"recibo-{document_id}.pdf"), res.content
                raise MoloniError(f"download do PDF falhou ({res.status_code})")
            await asyncio.sleep(wait)
        raise MoloniError("o PDF ainda não está pronto")

    async def info(self) -> dict[str, Any]:
        """Ajuda na configuração: empresas e, com MOLONI_COMPANY_ID, séries, artigos e métodos de pagamento."""
        companies = await self.gql("query { companies { errors { field msg } data { companyId name vat } } }", {}, "companies")
        out: dict[str, Any] = {"companies": (companies or {}).get("data") or []}
        if self.company:
            v = {"companyId": self.company}
            sets = await self.gql(
                "query($companyId: Int!) { documentSets(companyId: $companyId) { errors { field msg } data { documentSetId name isDefault } } }",
                v,
                "documentSets",
            )
            products = await self.gql(
                "query($companyId: Int!) { products(companyId: $companyId) { errors { field msg } data { productId reference name price } } }",
                v,
                "products",
            )
            methods = await self.gql(
                "query($companyId: Int!) { paymentMethods(companyId: $companyId) { errors { field msg } data { paymentMethodId name } } }",
                v,
                "paymentMethods",
            )
            out |= {"documentSets": sets.get("data"), "products": products.get("data"), "paymentMethods": methods.get("data")}
        return out
