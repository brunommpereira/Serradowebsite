import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, linkedSignal, signal, viewChildren } from '@angular/core';
import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AthleteAreaService } from '../../core/services/athlete-area.service';
import { AuthService } from '../../core/services/auth.service';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { Rsvp, Session } from '../../core/data/athletes-data';
import { IconComponent } from '../../shared/icon.component';
import { DialogComponent } from '../../shared/dialog.component';
import { SessionCardComponent } from './session-card.component';
import { ComparisonChartComponent } from './comparison-chart.component';
import { AthletesTabComponent } from './athletes-tab.component';
import { AreaSwitchComponent } from '../../shared/area-switch.component';
import { CompetitionsTabComponent } from './competitions-tab.component';

export type TabId = 'agenda' | 'evolucao' | 'competicoes' | 'historico' | 'atletas' | 'recibos' | 'clube';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'agenda', label: 'Agenda e Presenças', icon: 'calendar' },
  { id: 'evolucao', label: 'Evolução e Métricas', icon: 'trophy' },
  { id: 'competicoes', label: 'Competições', icon: 'run' },
  { id: 'historico', label: 'Histórico', icon: 'clock' },
  { id: 'atletas', label: 'Os Meus Atletas', icon: 'users' },
  { id: 'recibos', label: 'Os Meus Recibos', icon: 'euro' },
  { id: 'clube', label: 'O Meu Clube', icon: 'shield' },
];

const SEASON_START = '2026-09-01';

/** Área de Atletas — portal do encarregado de educação (modo demonstração). */
@Component({
  selector: 'sfc-athlete-area',
  imports: [
    RouterLink,
    FormsModule,
    DatePipe,
    NgTemplateOutlet,
    CurrencyPipe,
    IconComponent,
    DialogComponent,
    SessionCardComponent,
    ComparisonChartComponent,
    AthletesTabComponent,
    CompetitionsTabComponent,
    AreaSwitchComponent,
  ],
  templateUrl: './athlete-area.component.html',
  styleUrl: './athlete-area.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthleteAreaComponent {
  /** ?separador= e ?atleta= (link direto para um separador/educando) */
  readonly separador = input<string>();
  readonly atleta = input<string>();

  protected readonly area = inject(AthleteAreaService);
  private readonly auth = inject(AuthService);
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);

  protected readonly account = this.auth.account;
  protected readonly role = this.area.role;
  /** No perfil «Atleta» o separador de gestão de educandos passa a «Os Meus Dados». */
  protected readonly tabs = computed(() =>
    TABS.map((t) => (t.id === 'atletas' && this.role() === 'atleta' ? { ...t, label: 'Os Meus Dados', icon: 'user' } : t)),
  );
  protected readonly tab = linkedSignal<TabId>(() => (TABS.some((t) => t.id === this.separador()) ? (this.separador() as TabId) : 'agenda'));
  protected readonly athleteId = linkedSignal<string>(() => {
    const list = this.area.athletes();
    return list.find((a) => a.id === this.atleta())?.id ?? list[0]?.id ?? '';
  });
  protected readonly athlete = computed(() => this.area.athletes().find((a) => a.id === this.athleteId()));
  protected readonly sportName = (slug: string) => this.content.sport(slug)?.name ?? '';
  protected readonly sport = computed(() => {
    const a = this.athlete();
    return a ? this.content.sport(a.sportSlug) : undefined;
  });
  protected readonly pendingDocs = computed(() => this.athlete()?.documents.filter((d) => d.status !== 'Aprovado').length ?? 0);

  // ---- Agenda / Histórico
  protected readonly upcoming = computed(() => (this.athlete() ? this.area.upcoming(this.athleteId()) : []));
  protected readonly history = computed(() => (this.athlete() ? this.area.history(this.athleteId()) : []));
  protected readonly planSession = signal<Session | null>(null);

  // ---- Evolução
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly from = signal(daysAgo(30));
  protected readonly to = signal(this.today);
  protected readonly stats = computed(() => this.area.stats(this.athleteId(), this.from(), this.to()));
  protected readonly metrics = computed(() => this.area.metrics(this.athleteId()));
  protected readonly assessments = computed(() => this.area.assessments(this.athleteId()));
  protected readonly assessmentsOpen = signal(false);
  protected readonly attendanceRate = computed(() => {
    const s = this.stats();
    return s.sessions ? Math.round((s.attended / s.sessions) * 100) : 0;
  });

  // ---- Recibos
  protected readonly receipts = computed(() => this.area.receipts(this.athleteId()));
  protected readonly receiptsTotal = computed(() => this.receipts().reduce((acc, r) => acc + r.amount, 0));

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  constructor() {
    inject(SeoService).set({ title: 'Área de Atletas', description: 'Área reservada dos atletas e encarregados de educação do Serrado FC.', path: '/area-atletas' });
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/entrar');
  }

  selectAthlete(id: string) {
    this.athleteId.set(id);
    this.syncUrl();
  }

  selectTab(id: TabId) {
    this.tab.set(id);
    this.syncUrl();
  }

  /** Setas esquerda/direita, Home e End navegam entre separadores (padrão WAI-ARIA tabs). */
  onTabKey(event: KeyboardEvent, index: number) {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = (keys[event.key] + TABS.length) % TABS.length;
    this.selectTab(TABS[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  answer(session: Session, rsvp: Rsvp) {
    this.area.setRsvp(session.id, rsvp);
  }

  setRange(preset: '30' | 'epoca') {
    this.to.set(this.today);
    this.from.set(preset === '30' ? daysAgo(30) : SEASON_START);
  }

  /** "Exportar relatório": CSV com assiduidade e métricas do período selecionado. */
  exportReport() {
    const a = this.athlete();
    if (!a) return;
    const s = this.stats();
    const rows = [
      ['Relatório', `${a.name} (${this.sportName(a.sportSlug)} ${a.level})`],
      ['Período', `${this.from()} a ${this.to()}`],
      ['Minutos treinados', String(s.minutes)],
      ['Presenças', `${s.attended}/${s.sessions}`],
      ['Faltas', String(s.absences)],
      [],
      ['Data', 'Sessão', 'Estado', 'Presença', 'Minutos'],
      ...s.list.map((x) => [x.date.replace('T', ' '), x.title, x.status, x.attended ? 'Presente' : 'Falta', String(x.attended ? x.minutes : 0)]),
      [],
      ['Métrica', a.name, `Média ${a.level}`],
      ...this.metrics().map((m) => [m.label, String(m.athlete), String(m.average)]),
    ];
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    download(`relatorio-${slug(a.name)}-${this.from()}-${this.to()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  downloadForm(id: string) {
    const d = this.area.downloads.find((x) => x.id === id);
    if (!d) return;
    download(`${id}-serrado-fc.txt`, `SERRADO FUTEBOL CLUBE\n${d.title}\n\n${d.text}\n\nDocumento de demonstração — o modelo oficial será disponibilizado pelo clube.`, 'text/plain;charset=utf-8');
  }

  downloadReceipt(id: string) {
    const r = this.receipts().find((x) => x.id === id);
    const a = this.athlete();
    if (!r || !a) return;
    const text = [
      'SERRADO FUTEBOL CLUBE — NIPC 501523332',
      `Recibo ${r.number} · ${r.date}`,
      '',
      `Atleta: ${a.name} (${this.sportName(a.sportSlug)} ${a.level})`,
      `Descrição: ${r.description} — ${r.period}`,
      `Valor: ${r.amount.toFixed(2).replace('.', ',')} €`,
      '',
      'Documento de demonstração — sem valor fiscal.',
    ].join('\n');
    download(`recibo-${r.number.replace('/', '-')}.txt`, text, 'text/plain;charset=utf-8');
  }

  private syncUrl() {
    this.router.navigate([], {
      queryParams: { separador: this.tab(), atleta: this.athleteId() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
