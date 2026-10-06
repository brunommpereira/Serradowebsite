/*
 * Conteúdo editável do site.
 * Para atualizar jogos, notícias, equipas ou patrocinadores basta editar este ficheiro —
 * não é preciso mexer no HTML.
 *
 * ATENÇÃO: os jogos, notícias e patrocinadores abaixo são EXEMPLOS ilustrativos.
 * Substituir pelos dados reais do clube antes de publicar.
 */
window.SITE_DATA = {
  contactEmail: "geral@serradofc.pt",

  timeline: [
    { year: "1978", text: "Fundação do Serrado Futebol Clube, a 29 de abril, no Bairro do Serrado, Caparica." },
    { year: "Anos 80", text: "Primeiras participações em competições distritais da AF Setúbal." },
    { year: "Anos 2000", text: "Aposta forte na formação, com escalões dos Petizes aos Juniores." },
    { year: "Hoje", text: "Um clube de referência no bairro, com centenas de atletas e famílias envolvidas." }
  ],

  teams: [
    { name: "Petizes", age: "Sub-7", schedule: "Ter e Qui · 18h00" },
    { name: "Traquinas", age: "Sub-9", schedule: "Ter e Qui · 18h00" },
    { name: "Benjamins", age: "Sub-11", schedule: "Seg, Qua e Sex · 18h30" },
    { name: "Infantis", age: "Sub-13", schedule: "Seg, Qua e Sex · 18h30" },
    { name: "Iniciados", age: "Sub-15", schedule: "Seg, Qua e Sex · 19h30" },
    { name: "Juvenis", age: "Sub-17", schedule: "Seg, Qua e Sex · 19h30" },
    { name: "Juniores", age: "Sub-19", schedule: "Ter, Qua e Sex · 20h00" },
    { name: "Seniores", age: "Equipa principal", schedule: "Ter, Qui e Sex · 21h00" }
  ],

  // date no formato AAAA-MM-DDTHH:MM. Jogos com "score" aparecem em Resultados.
  fixtures: [
    { date: "2026-10-11T15:00", competition: "Campeonato Distrital", home: "Serrado FC", away: "Adversário A", venue: "Centro de Treinos do Serrado" },
    { date: "2026-10-18T15:00", competition: "Campeonato Distrital", home: "Adversário B", away: "Serrado FC", venue: "Fora" },
    { date: "2026-10-25T15:00", competition: "Taça Distrital", home: "Serrado FC", away: "Adversário C", venue: "Centro de Treinos do Serrado" },
    { date: "2026-09-27T15:00", competition: "Campeonato Distrital", home: "Serrado FC", away: "Adversário D", venue: "Centro de Treinos do Serrado", score: "2-1" },
    { date: "2026-09-20T15:00", competition: "Campeonato Distrital", home: "Adversário E", away: "Serrado FC", venue: "Fora", score: "1-1" },
    { date: "2026-09-13T15:00", competition: "Campeonato Distrital", home: "Serrado FC", away: "Adversário F", venue: "Centro de Treinos do Serrado", score: "3-0" }
  ],

  news: [
    { date: "2026-10-01", tag: "Formação", title: "Inscrições abertas para a época 2026/27", text: "Todos os escalões estão a receber novos atletas. Vem experimentar um treino gratuito." },
    { date: "2026-09-27", tag: "Seniores", title: "Vitória em casa frente ao Adversário D", text: "Exibição de garra da equipa principal perante uma bancada cheia." },
    { date: "2026-09-15", tag: "Clube", title: "Campanha de sócios 2026", text: "Atualiza as tuas quotas e ajuda a manter vivo o clube do bairro." }
  ],

  sponsors: ["Patrocinador 1", "Patrocinador 2", "Patrocinador 3", "Patrocinador 4", "Patrocinador 5"]
};
