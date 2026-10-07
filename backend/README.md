# Backend privado — Área de Atletas

O site é estático e público: está no GitHub Pages e o repositório é público. Por isso **nenhum dado pessoal real pode estar no código nem no repositório**. Hoje a Área de Atletas funciona em modo de demonstração, com dados fictícios. Para usar os dados reais (atletas, contactos, documentos e resultados), estes passam a viver num backend privado.

## Arquitetura recomendada

```
GitHub Pages (Angular, público)  ──HTTPS──▶  Supabase (região UE)
  • páginas públicas                          • Auth: email + password / link mágico
  • Área de Sócio / Atletas (no browser)      • Postgres com Row Level Security
                                              • Storage privado (documentos de inscrição)
```

- **Supabase** é Postgres gerido, com autenticação e armazenamento de ficheiros, e tem plano gratuito. A chave pública (`anon key`) pode ir para o site porque **as regras de acesso estão na base de dados**: cada conta só lê os atletas a que tem acesso. Mesmo que alguém use a API diretamente, não vê dados de outros.
- **Uma conta por pessoa:** ser sócio é opcional (`accounts.member_number`). Na mesma conta, quem é sócio e atleta ou encarregado entra pelo ponto de acesso único `/entrar` e muda de área sem voltar a autenticar-se.
- **Perfis:**
  - **encarregado de educação** vê e gere os seus educandos e pode convidar até 2 co-encarregados;
  - **atleta** vê o seu próprio registo;
  - **staff** (secretaria, treinadores) usa o backoffice «Administração».
- Alternativas: Firebase, ou uma API própria (por exemplo .NET ou Node num servidor do clube). O esquema em `supabase/schema.sql` é Postgres normal e serve de base em qualquer uma delas.

## Ficheiros

| Ficheiro | O que é |
|---|---|
| `supabase/schema.sql` | Tabelas (`accounts`, `athletes`, `athlete_access`, `athlete_change_requests`, `guardian_invites`, `races`, `results`, `staff`), regras RLS e proteção dos dados de identificação |
| `../tools/trofeu-almada/` | Extração dos resultados do troféu, consolidação com a base de dados do clube e CSV de importação |

## Passos para pôr em produção

1. Criar um projeto em [supabase.com](https://supabase.com), na **região UE**, com uma conta do clube.
2. No SQL Editor, executar `supabase/schema.sql`.
3. Gerar os CSV de importação (ver `tools/trofeu-almada/README.md`) e importá-los: `athletes.csv` para `athletes`, e `results.csv` para `import_results`, seguido do `INSERT` comentado no fim do esquema.
4. Criar as contas (convite por email) e associar cada uma aos seus atletas em `athlete_access` (encarregado → educandos; atleta → o próprio).
5. **Dados do atleta:** o encarregado ou o atleta pode alterar contactos, equipamento, emergência e consentimentos, e confirmar a ficha em cada época (`confirmed_at`). As alterações a nome, data de nascimento, género, CC ou NIF entram como pedido em `athlete_change_requests` e só são aplicadas depois de a secretaria as validar. Um trigger garante isto mesmo que alguém chame a API diretamente.
6. No site, configurar o URL do projeto e a `anon key`. Depois, trocar o modo de demonstração do `AthleteAreaService` pelas chamadas ao Supabase. Os métodos já indicam o endpoint equivalente.

## RGPD

- A base de dados tem dados de menores e dados sensíveis (CC, NIF, morada). É preciso ter consentimento (declaração RGPD), minimizar os dados (o CC e o NIF só são necessários para a secretaria) e ter um registo de quem acede.
- Os documentos de inscrição ficam num bucket **privado**, acedidos por URLs assinadas e temporários.
- Nunca colocar exportações (`.xlsx`, `.csv`) no repositório: `tools/trofeu-almada/out/` está no `.gitignore`.
