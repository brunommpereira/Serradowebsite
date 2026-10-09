"""Conteúdos do site editáveis (blocos): público, edição, validação, histórico e documentos em PDF."""

import base64

from serrado.db.pool import fetch

PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


async def test_blocos_editados_aparecem_no_site_e_ficam_no_historico(mw):
    public = mw.client()
    assert (await public.get("/api/v1/content/blocks")).json() == {}
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    empty = (await ed.get("/api/v1/admin/site/blocks/contacts")).json()
    assert empty == {"key": "contacts", "data": None, "updatedAt": None, "updatedBy": None}

    contacts = {"phone": "+351 212 000 000", "email": "geral@serradofc.pt", "hours": [{"days": "Segunda a Sexta", "time": "18h00 – 22h00"}]}
    r = await ed.put("/api/v1/admin/site/blocks/contacts", json={"data": contacts})
    assert r.status_code == 200, r.text
    assert r.json()["data"] == contacts and r.json()["updatedBy"]
    # O público vê logo (a gravação limpa a cache)
    assert (await public.get("/api/v1/content/blocks")).json() == {"contacts": contacts}

    await ed.put("/api/v1/admin/site/blocks/contacts", json={"data": {**contacts, "phone": "+351 213 000 000"}})
    revs = (await ed.get("/api/v1/admin/site/blocks/contacts/revisions")).json()
    assert len(revs) == 2 and revs[0]["original"] is False
    restored = await ed.post(f"/api/v1/admin/site/blocks/contacts/revisions/{revs[1]['id']}/restore")
    assert restored.json()["data"]["phone"] == "+351 212 000 000"

    # Voltar ao original: o bloco desaparece (o site usa o conteúdo do código) e fica no histórico
    assert (await ed.delete("/api/v1/admin/site/blocks/contacts")).status_code == 204
    assert (await public.get("/api/v1/content/blocks")).json() == {}
    revs = (await ed.get("/api/v1/admin/site/blocks/contacts/revisions")).json()
    assert revs[0]["original"] is True
    back = await ed.post(f"/api/v1/admin/site/blocks/contacts/revisions/{revs[1]['id']}/restore")
    assert back.json()["data"]["phone"] == "+351 212 000 000"
    actions = [a["action"] for a in await fetch(mw.pool, "select action from audit_log where action like 'site.%' order by id")]
    assert actions == ["site.block.save", "site.block.save", "site.block.save", "site.block.reset", "site.block.save"]


async def test_validacao_e_permissoes_dos_blocos(mw):
    ed = await mw.login("editor@serradofc.pt", "editor2026")

    async def put(key: str, data: object) -> int:
        return (await ed.put(f"/api/v1/admin/site/blocks/{key}", json={"data": data})).status_code

    assert await put("nao-existe", {"a": 1}) == 404
    assert await put("shop", {"products": [{"name": "Boné", "url": "javascript:alert(1)"}]}) == 400
    assert await put("shop", {"products": [{"name": "Boné", "url": " JavaScript:alert(1)"}]}) == 400
    assert await put("shop", {"bad key": 1}) == 400
    assert await put("shop", {"a": {"b": {"c": {"d": {"e": 1}}}}}) == 400
    assert await put("shop", {"items": list(range(1001))}) == 400
    assert await put("shop", {"text": "x" * 20001}) == 400
    assert await put("shop", {"products": [{"name": "Boné", "price": 12.5, "available": True, "sizes": ["Único"], "imageUrl": None}]}) == 200
    assert (await ed.put("/api/v1/admin/site/blocks/shop", json={"data": [1, 2]})).status_code == 400
    # Só quem edita conteúdos
    tes = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await tes.put("/api/v1/admin/site/blocks/shop", json={"data": {}})).status_code == 403
    assert (await tes.get("/api/v1/admin/site/blocks/shop")).status_code == 403
    assert (
        await mw.client().put("/api/v1/admin/site/blocks/shop", json={"data": {}}, headers={"x-requested-with": "XMLHttpRequest"})
    ).status_code == 401


async def test_documentos_em_pdf_na_biblioteca(mw):
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    pdf = b"%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n"
    up = await ed.post("/api/v1/admin/media", json={"name": "Estatutos 2020.pdf", "data": base64.b64encode(pdf).decode()})
    assert up.status_code == 201, up.text
    assert up.json()["mime"] == "application/pdf"
    key, media_id = up.json()["key"], up.json()["id"]
    got = await mw.client().get(f"/api/v1/media/{key}.pdf")
    assert got.status_code == 200 and got.content == pdf
    assert got.headers["content-type"] == "application/pdf"
    assert got.headers["content-disposition"] == "inline; filename*=UTF-8''Estatutos%202020.pdf"
    # Usado num bloco: não se pode apagar
    doc = {"items": [{"title": "Estatutos", "category": "Estatutos", "year": "2020", "url": f"/api/v1/media/{key}.pdf"}]}
    assert (await ed.put("/api/v1/admin/site/blocks/documents", json={"data": doc})).status_code == 200
    used = await ed.delete(f"/api/v1/admin/media/{media_id}")
    assert used.status_code == 409 and "documents" in used.json()["message"]
    # Outros formatos continuam recusados
    html = base64.b64encode(b"<html><script>alert(1)</script></html>").decode()
    assert (await ed.post("/api/v1/admin/media", json={"name": "x.html", "data": html})).status_code == 415


async def test_assinatura_dos_emails(mw, monkeypatch):
    from serrado.config import MailConfig, config
    from serrado.db.pool import execute
    from serrado.mail import SIGNATURE_MARK, enqueue, layout, send_pending, signature_html

    # Texto escapado, com **negrito**, *itálico*, parágrafos e o símbolo no fim (só com endereço https)
    html = signature_html({"text": "**SERRADO** <b>x</b>\n*Desporto*\n\n🏆 Campeão", "logoUrl": None, "logoSize": 500}, "https://www.serradofc.pt")
    assert "<strong>SERRADO</strong> &lt;b&gt;x&lt;/b&gt;<br><em>Desporto</em></p><p" in html and "🏆 Campeão" in html
    assert 'src="https://www.serradofc.pt/brand/email-logo.png"' in html and 'width="240"' in html
    assert "<img" not in signature_html({"showLogo": True}, "")
    assert "<img" not in signature_html({"showLogo": False}, "https://www.serradofc.pt")
    assert SIGNATURE_MARK in layout("Título", ["Texto"])

    # O envio põe a assinatura guardada no backoffice (a da fila tem só o marcador)
    monkeypatch.setattr(config.oauth, "site_url", "https://www.serradofc.pt")
    ed = await mw.login("editor@serradofc.pt", "editor2026")
    up = await ed.post("/api/v1/admin/media", json={"name": "simbolo.png", "data": PNG})
    url = f"/api/v1/media/{up.json()['key']}.png"
    sig = {"text": "**Direção do Serrado FC**", "showLogo": True, "logoUrl": url, "logoSize": 80}
    assert (await ed.put("/api/v1/admin/site/blocks/email", json={"data": sig})).status_code == 200
    logo = await mw.client().get("/api/v1/email/logo.png")
    assert logo.status_code == 200 and logo.headers["content-type"] == "image/png" and logo.content.startswith(b"\x89PNG")

    await execute(mw.pool, "delete from email_outbox")
    async with mw.pool.connection() as c:
        await enqueue(c, to_email="socio@exemplo.pt", to_name="Sócio", subject="Olá", html_body=layout("Olá", ["Texto"]))
    seen: list[dict] = []

    class Client:
        async def send(self, row: dict) -> None:
            seen.append(row)

    cfg = MailConfig(brevo_api_key="k", from_email="site@serradofc.pt", from_name="Serrado FC")
    assert (await send_pending(mw.pool, cfg, Client())).sent == 1
    sent = seen[0]["html"]
    assert SIGNATURE_MARK not in sent and "<strong>Direção do Serrado FC</strong>" in sent
    assert "https://www.serradofc.pt/api/v1/email/logo.png?v=" in sent and 'width="80"' in sent

    # Email de teste: só com o envio configurado e para quem pede
    assert (await ed.post("/api/v1/admin/site/email-test")).json()["error"] == "mail_disabled"
    monkeypatch.setattr(config.mail, "brevo_api_key", "xkeysib-teste")
    monkeypatch.setattr(config.mail, "from_email", "site@serradofc.pt")
    r = await ed.post("/api/v1/admin/site/email-test")
    assert r.status_code == 202 and r.json() == {"email": "editor@serradofc.pt"}
    tes = await mw.login("tesouraria@serradofc.pt", "tesouraria2026")
    assert (await tes.post("/api/v1/admin/site/email-test")).status_code == 403
