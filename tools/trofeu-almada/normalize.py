"""Normaliza provas/escalões entre épocas e gera a comparação de tempos ano a ano.

Uso: python3 normalize.py out/resultados-brutos.csv out/resultados.csv out/comparacao.csv
"""
import csv, re, sys, unicodedata
from collections import defaultdict

SRC, OUT, CMP = sys.argv[1:4]
SEASONS = ['2023/2024', '2024/2025', '2025/2026']

PROVAS = [  # (padrão no nome publicado, nome base comparável)
    (r'S[ãa]o Martinho', 'GP São Martinho de Almada'),
    (r'Trof[ée]u da Caparica', 'Troféu da Caparica'),
    (r'Charneca', 'GPA Charneca da Caparica'),
    (r'Corta-Mato Rui', 'Corta-Mato Rui Duarte Silva'),
    (r'Milha', 'Milha Urbana Alberto Chaíça'),
    (r'Egas Moniz', 'Corrida Egas Moniz'),
    (r'CS Armada', 'GP Atletismo do CS Armada'),
    (r'Corta-Mato dos Reis', 'Corta-Mato dos Reis'),
    (r'Noturna dos Reis', 'Corrida Noturna dos Reis'),
]
ESCALOES = [
    (r'^Ben(j )?A', 'Benjamins A'), (r'^Ben(j )?B', 'Benjamins B'), (r'^Inf', 'Infantis'),
    (r'^Ini', 'Iniciados'), (r'^Juv', 'Juvenis'), (r'^J[uú]n', 'Juniores'), (r'^S[eé]n', 'Seniores'),
    (r'^Vet(VIII|VII|VI|V|IV|III|II|I)\b', None),
]

def prova_base(name):
    for pat, base in PROVAS:
        if re.search(pat, name, re.I):
            return base
    return name

def edicao(name, season):
    m = re.match(r'(\d+)\s*[ºª]', name)
    return m.group(1) if m else ''

def escalao_base(esc):
    sexo = 'F' if re.search(r'\sF\b', esc) else 'M' if re.search(r'\sM\b', esc) else ''
    for pat, base in ESCALOES:
        m = re.search(pat, esc)
        if m:
            if base is None:
                base = ('Veteranas ' if sexo == 'F' else 'Veteranos ') + m.group(1)
            return base, sexo
    return esc, sexo

def segundos(t):
    if not t:
        return ''
    parts = t.split(':')
    try:
        s = sum(float(p) * 60 ** i for i, p in enumerate(reversed(parts)))
    except ValueError:
        return ''
    return f'{s:.2f}'

def fmt(sec):
    sec = float(sec)
    m, s = divmod(sec, 60)
    h, m = divmod(int(m), 60)
    return (f'{h}:{m:02d}:{s:05.2f}' if h else f'{m}:{s:05.2f}')

def norm(name):
    n = unicodedata.normalize('NFD', name.upper())
    return re.sub(r'\s+', ' ', ''.join(c for c in n if unicodedata.category(c) != 'Mn')).strip()

with open(SRC, encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f, delimiter=';'))

out_fields = ['Época', 'N.º prova', 'Prova', 'Prova (nome base)', 'Edição', 'Data', 'Tipo',
              'Escalão', 'Escalão (base)', 'Sexo', 'Classificação no escalão', 'Dorsal', 'Nome',
              'Ano nascimento', 'Equipa', 'Tempo / Marca', 'Tempo (s)', 'Pontos equipas', 'Pontos troféu', 'Fonte']
for r in rows:
    r['Prova (nome base)'] = prova_base(r['Prova'])
    r['Edição'] = edicao(r['Prova'], r['Época'])
    r['Escalão (base)'], r['Sexo'] = escalao_base(r['Escalão'])
    r['Tempo (s)'] = segundos(r['Tempo / Marca'])

with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=out_fields, delimiter=';', extrasaction='ignore')
    w.writeheader(); w.writerows(rows)

# ---- Comparação: uma linha por atleta × prova, com o resultado de cada época
groups = defaultdict(dict)
for r in rows:
    key = (norm(r['Nome']), r['Ano nascimento'], r['Prova (nome base)'])
    groups[key][r['Época']] = r

cmp_fields = ['Nome', 'Ano nascimento', 'Sexo', 'Prova (nome base)', 'N.º épocas']
for s in SEASONS:
    y = s[2:4] + '/' + s[7:9]
    cmp_fields += [f'Escalão {y}', f'Class. {y}', f'Tempo {y}']
cmp_fields += ['Melhor tempo', 'Época do melhor tempo', 'Evolução última vs anterior (s)', 'Mesmo escalão']

out = []
for (_, ano, prova), by in groups.items():
    any_r = next(iter(by.values()))
    line = {'Nome': any_r['Nome'], 'Ano nascimento': ano, 'Sexo': any_r['Sexo'], 'Prova (nome base)': prova, 'N.º épocas': len(by)}
    for s in SEASONS:
        y = s[2:4] + '/' + s[7:9]
        r = by.get(s)
        line[f'Escalão {y}'] = r['Escalão (base)'] if r else ''
        line[f'Class. {y}'] = r['Classificação no escalão'] if r else ''
        line[f'Tempo {y}'] = r['Tempo / Marca'] if r else ''
    timed = [(s, by[s]) for s in SEASONS if s in by and by[s]['Tempo (s)']]
    if timed:
        best_s, best = min(timed, key=lambda x: float(x[1]['Tempo (s)']))
        line['Melhor tempo'] = fmt(best['Tempo (s)'])
        line['Época do melhor tempo'] = best_s
    if len(timed) >= 2:
        (_, prev), (_, last) = timed[-2], timed[-1]
        diff = float(last['Tempo (s)']) - float(prev['Tempo (s)'])
        line['Evolução última vs anterior (s)'] = f'{diff:+.2f}'.replace('.', ',')
        line['Mesmo escalão'] = 'Sim' if last['Escalão (base)'] == prev['Escalão (base)'] else 'Não — mudou de escalão (nos jovens muda a distância)'
    out.append(line)

out.sort(key=lambda l: (-l['N.º épocas'], l['Prova (nome base)'], l['Nome']))
with open(CMP, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cmp_fields, delimiter=';')
    w.writeheader(); w.writerows(out)

multi = [l for l in out if l['N.º épocas'] > 1]
print(f'{len(rows)} resultados → {OUT}')
print(f'{len(out)} combinações atleta×prova ({len(multi)} com 2+ épocas) → {CMP}')
print('Provas base:', sorted({r["Prova (nome base)"] for r in rows}))
print('Escalões base:', sorted({r["Escalão (base)"] for r in rows}))
