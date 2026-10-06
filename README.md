# Serradowebsite
Site oficial do Serrado Futebol Clube, fundado a 29 de abril de 1978 no Bairro do Serrado, Caparica (Almada).

Site estático (HTML + CSS + JavaScript). Não precisa de instalar nada nem de fazer build.

## Estrutura

```
index.html          Página única com todas as secções
css/styles.css      Estilos (cores do clube nas variáveis do topo)
js/data.js          Conteúdo editável: jogos, notícias, equipas, cronologia, patrocinadores
js/main.js          Menu móvel, contagem decrescente, filtros, animações, formulário
assets/img/logo.svg Emblema (PROVISÓRIO: substituir pelo oficial)
```

## Ver localmente

Abrir `index.html` no browser, ou:

```bash
python3 -m http.server 8000   # depois abrir http://localhost:8000
```

## Publicar (GitHub Pages)

Settings → Pages → *Deploy from a branch* → escolher o ramo e a pasta `/ (root)`.

## Antes de publicar: rever

- **Logo**: substituir `assets/img/logo.svg` pelo emblema oficial. Pode ser `.png`; nesse caso, atualizar as referências em `index.html` e `js/main.js`.
- **Cores**: ajustar `--primary`, `--primary-dark` e `--accent` em `css/styles.css` às cores oficiais.
- **Conteúdo de exemplo** em `js/data.js`: jogos, adversários, resultados, notícias, horários de treino e patrocinadores são fictícios.
- **Email** `geral@serradofc.pt`: é provisório. Mudar em `js/data.js` (`contactEmail`) e em `index.html`.
- **Números do hero** (escalões, atletas) e textos da cronologia/instalações: confirmar com o clube.
- **Formulário**: sem servidor, abre o programa de email do visitante. Para receber as mensagens diretamente, ligar a um serviço como Formspree ou Netlify Forms.
