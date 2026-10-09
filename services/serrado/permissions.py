"""Catálogo de permissões (fixo no código). Os papéis e as permissões de cada um configuram-se no backoffice."""

PERMISSIONS: dict[str, str] = {
    "cms.edit": "Conteúdos do site: notícias, eventos, páginas, parceiros e imagens",
    "athletes.view": "Ver atletas (fichas sem dados sensíveis)",
    "athletes.sensitive": "Ver dados sensíveis dos atletas (CC, NIF, morada)",
    "athletes.manage": "Criar e alterar atletas e encarregados; validar pedidos e documentos",
    "members.view": "Ver sócios e quotas",
    "members.manage": "Criar e alterar sócios; importar sócios e atletas",
    "payments.view": "Ver pagamentos e descarregar recibos",
    "payments.manage": "Registar pagamentos, emitir recibos, valores de quotas e mensalidades",
    "results.import": "Importar resultados de provas",
    "registrations.manage": "Documentos legais (condições, RGPD, imagem) e registos online",
    "users.manage": "Utilizadores, papéis e permissões",
    "audit.all": "Ver toda a auditoria (os outros veem só as suas ações)",
}

ADMIN = "admin"

# Permissões de origem de cada papel (as mesmas da migração 010; o seed de demonstração repõe-nas)
DEFAULT_ROLES: dict[str, list[str]] = {
    "secretaria": [
        "athletes.view",
        "athletes.sensitive",
        "athletes.manage",
        "members.view",
        "members.manage",
        "payments.view",
        "results.import",
        "registrations.manage",
    ],
    "tesouraria": ["members.view", "payments.view", "payments.manage"],
    "editor": ["cms.edit"],
    "treinador": ["athletes.view"],
}


def effective(roles: list[str], granted: set[str]) -> set[str]:
    """O papel admin tem sempre todas as permissões (não se pode ficar sem acesso ao backoffice)."""
    return set(PERMISSIONS) if ADMIN in roles else {p for p in granted if p in PERMISSIONS}
