"""Conteúdos do site editáveis (blocos): público, edição, validação, histórico e documentos em PDF."""

import base64

from serrado.db.pool import fetch


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
