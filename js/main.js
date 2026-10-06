(function () {
  "use strict";

  var data = window.SITE_DATA || {};
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var dateFmt = new Intl.DateTimeFormat("pt-PT", { weekday: "short", day: "2-digit", month: "short" });
  var timeFmt = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" });
  var longFmt = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" });

  /* ---------- Menu móvel ---------- */
  var toggle = $(".nav-toggle");
  var nav = $(".site-nav");
  toggle.addEventListener("click", function () {
    var open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    toggle.setAttribute("aria-label", open ? "Abrir menu" : "Fechar menu");
    nav.classList.toggle("open", !open);
    document.body.classList.toggle("nav-open", !open);
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) {
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("open");
      document.body.classList.remove("nav-open");
    }
  });

  /* ---------- Cabeçalho ao fazer scroll ---------- */
  var header = $(".site-header");
  var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 20); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Anos de história ---------- */
  var now = new Date();
  var years = $("[data-count-from-year]");
  if (years) years.textContent = now.getFullYear() - Number(years.dataset.countFromYear);
  $("#year").textContent = now.getFullYear();

  /* ---------- Cronologia ---------- */
  $("#timeline").innerHTML = (data.timeline || []).map(function (t) {
    return '<li class="reveal"><span class="t-year">' + esc(t.year) + "</span><p>" + esc(t.text) + "</p></li>";
  }).join("");

  /* ---------- Equipas ---------- */
  $("#teams").innerHTML = (data.teams || []).map(function (t) {
    return '<article class="card team reveal">' +
      '<p class="team-age">' + esc(t.age) + "</p>" +
      "<h3>" + esc(t.name) + "</h3>" +
      '<p class="team-schedule">' + esc(t.schedule) + "</p>" +
      '<a class="text-link" href="#contactos">Inscrever →</a>' +
      "</article>";
  }).join("");

  /* ---------- Jogos ---------- */
  var fixtures = (data.fixtures || []).map(function (f) {
    return Object.assign({}, f, { when: new Date(f.date) });
  });
  var upcoming = fixtures.filter(function (f) { return !f.score && f.when >= now; })
    .sort(function (a, b) { return a.when - b.when; });
  var results = fixtures.filter(function (f) { return f.score; })
    .sort(function (a, b) { return b.when - a.when; });

  function teamHtml(name) {
    var isUs = /serrado/i.test(name);
    return '<span class="team-name' + (isUs ? " us" : "") + '">' + esc(name) + "</span>";
  }

  function fixtureHtml(f) {
    var middle = f.score
      ? '<span class="score">' + esc(f.score.replace("-", " – ")) + "</span>"
      : '<span class="vs">' + timeFmt.format(f.when) + "</span>";
    return '<li class="fixture">' +
      '<div class="fx-meta"><span class="fx-date">' + dateFmt.format(f.when) + "</span>" +
      '<span class="fx-comp">' + esc(f.competition) + "</span></div>" +
      '<div class="fx-teams">' + teamHtml(f.home) + middle + teamHtml(f.away) + "</div>" +
      '<div class="fx-venue">' + esc(f.venue || "") + "</div>" +
      "</li>";
  }

  function renderFixtures(kind) {
    var list = kind === "resultados" ? results : upcoming;
    $("#fixtures").innerHTML = list.length
      ? list.map(fixtureHtml).join("")
      : '<li class="fixture empty">Sem jogos para mostrar.</li>';
  }
  renderFixtures("proximos");

  document.querySelectorAll(".tabs [role=tab]").forEach(function (btn, i, all) {
    btn.addEventListener("click", function () {
      all.forEach(function (b) { b.setAttribute("aria-selected", String(b === btn)); });
      renderFixtures(btn.dataset.filter);
    });
  });

  /* ---------- Próximo jogo + contagem decrescente ---------- */
  var next = upcoming[0];
  var nm = $("#next-match");
  if (next) {
    nm.innerHTML =
      '<div class="nm-info"><p class="eyebrow">Próximo jogo · ' + esc(next.competition) + "</p>" +
      '<p class="nm-teams">' + teamHtml(next.home) + '<span class="vs">vs</span>' + teamHtml(next.away) + "</p>" +
      '<p class="nm-when">' + longFmt.format(next.when) + " · " + timeFmt.format(next.when) + " · " + esc(next.venue) + "</p></div>" +
      '<div class="countdown" aria-label="Tempo até ao jogo">' +
      ["dias", "horas", "min", "seg"].map(function (u) {
        return '<div><strong data-unit="' + u + '">00</strong><span>' + u + "</span></div>";
      }).join("") + "</div>";

    var tick = function () {
      var diff = Math.max(0, next.when - new Date());
      var parts = {
        dias: Math.floor(diff / 864e5),
        horas: Math.floor(diff / 36e5) % 24,
        min: Math.floor(diff / 6e4) % 60,
        seg: Math.floor(diff / 1e3) % 60
      };
      Object.keys(parts).forEach(function (k) {
        nm.querySelector('[data-unit="' + k + '"]').textContent = String(parts[k]).padStart(2, "0");
      });
    };
    tick();
    setInterval(tick, 1000);
  } else {
    nm.parentElement.parentElement.hidden = true;
  }

  /* ---------- Notícias ---------- */
  $("#news").innerHTML = (data.news || []).map(function (n, i) {
    return '<article class="news-card reveal' + (i === 0 ? " featured" : "") + '">' +
      '<div class="news-thumb" aria-hidden="true"><img src="assets/img/logo.svg" alt="" loading="lazy"></div>' +
      '<div class="news-body"><p class="news-meta"><span class="tag">' + esc(n.tag) + "</span>" +
      '<time datetime="' + esc(n.date) + '">' + longFmt.format(new Date(n.date)) + "</time></p>" +
      "<h3>" + esc(n.title) + "</h3><p>" + esc(n.text) + "</p></div></article>";
  }).join("");

  /* ---------- Patrocinadores ---------- */
  $("#sponsors").innerHTML = (data.sponsors || []).map(function (s) {
    return "<li>" + esc(s) + "</li>";
  }).join("");

  /* ---------- Formulário de contacto (sem servidor: abre o cliente de email) ---------- */
  var form = $("#contact-form");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = $(".form-status", form);
    if (!form.checkValidity()) {
      status.textContent = "Por favor preenche todos os campos com dados válidos.";
      status.className = "form-status error";
      form.reportValidity();
      return;
    }
    var fd = new FormData(form);
    var body = fd.get("mensagem") + "\n\n— " + fd.get("nome") + " (" + fd.get("email") + ")";
    window.location.href = "mailto:" + (data.contactEmail || "") +
      "?subject=" + encodeURIComponent("[Site] " + fd.get("assunto")) +
      "&body=" + encodeURIComponent(body);
    status.textContent = "A abrir o teu programa de email…";
    status.className = "form-status ok";
  });

  /* ---------- Animações ao entrar no ecrã ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }
})();
