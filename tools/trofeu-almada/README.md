# Troféu Almada em Atletismo — extração e consolidação

Estas ferramentas recolhem os resultados oficiais do [Troféu Almada em Atletismo «Mário Pinto Claro»](https://tatletismo-almada.pt/) dos atletas do Serrado FC e juntam-nos à base de dados do clube.

> ⚠️ Os ficheiros que entram e os que saem têm **dados pessoais** (CC, NIF, moradas, menores). Guarda-os só em `out/`, que está no `.gitignore`, ou fora do repositório.

## 1. Extrair resultados (Playwright)

```bash
cd tools/trofeu-almada
npm install            # instala o Playwright
npx playwright install chromium
node extract.js out/resultados-brutos.csv
```

- **2023/24 e 2024/25:** lê as tabelas de cada prova diretamente no browser.
- **2025/26:** usa os CSV que a organização publica, sempre a versão mais recente de cada um.
- No fim compara os pontos de 25/26 com a classificação geral do troféu, para confirmar que cada ficheiro corresponde à prova certa.
- **Nova época:** acrescentar as provas em `CAL` / `CSV_2526` no `extract.js`, as distâncias em `DIST` no `consolidate.py` e os regulamentos em `regulamentos.tsv`.

## 2. Normalizar e comparar épocas

```bash
python3 normalize.py out/resultados-brutos.csv out/resultados.csv out/comparacao.csv
```

- **Nome base da prova:** acrescenta um nome que se mantém entre épocas (por exemplo "GP São Martinho de Almada", seja qual for a edição) e o número da edição.
- **Escalão e tempo:** normaliza o escalão e converte o tempo para segundos.

## 3. Consolidar com a base de dados do clube

```bash
pip install openpyxl
python3 consolidate.py --bd "BD.xlsx" --form "Respostas_1.xlsx" --form "Respostas.xlsx" \
  --results out/resultados.csv --out out/serrado-consolidado.xlsx --import-dir out/import
```

Gera um Excel com as folhas **Notas**, **Atletas**, **Resultados**, **Comparação épocas**, **Distâncias**, **Corrida Natal (Form. 2)** e **Por associar**. Com `--import-dir`, gera também os CSV `athletes.csv` e `results.csv` para importar no backend (ver `backend/README.md`).

### Como liga os dados

- **Atletas da base de dados:** um registo por pessoa, identificada pelo n.º de CC normalizado (8 dígitos, sem zeros à esquerda nem dígito de controlo). Junta também registos com a mesma data de nascimento e nome compatível.
- **Resultados 25/26:** ligados pelo dorsal do troféu e pelo nome.
- **Resultados das épocas anteriores:** ligados por nome e ano de nascimento. Aceita uma letra de diferença ou uma abreviatura, para apanhar gralhas do site oficial.
- **Distâncias:** vêm do regulamento de cada prova. Quando o ritmo é impossível para essa distância, o resultado é assinalado.
