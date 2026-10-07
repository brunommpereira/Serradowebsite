import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';
import { AgendaItem } from '../../core/models';

type Filter = 'todos' | 'atletismo' | 'futsal' | 'rugby' | 'clube' | 'eventos';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'atletismo', label: 'Atletismo' },
  { id: 'futsal', label: 'Futsal' },
  { id: 'rugby', label: 'Rugby' },
  { id: 'clube', label: 'Clube' },
  { id: 'eventos', label: 'Eventos' },
];

@Component({
  selector: 'sfc-agenda',
  imports: [RouterLink, DatePipe, PageHeroComponent, IconComponent],
  templateUrl: './agenda.component.html',
  styleUrl: './agenda.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaComponent {
  /** ?modalidade= */
  readonly modalidade = input<string>();
  private readonly content = inject(ContentService);

  protected readonly filters = FILTERS;
  protected readonly filter = linkedSignal<Filter>(() => (FILTERS.some((f) => f.id === this.modalidade()) ? (this.modalidade() as Filter) : 'todos'));
  protected readonly view = signal<'lista' | 'calendario'>('lista');

  private readonly all = this.content.agenda();
  protected readonly items = computed(() => this.all.filter((i) => matches(i, this.filter())));

  /** Agrupado por mês para a vista de lista */
  protected readonly byMonth = computed(() => {
    const groups = new Map<string, AgendaItem[]>();
    for (const i of this.items()) {
      const key = i.date.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    return [...groups.entries()].map(([month, items]) => ({ month: `${month}-01`, items }));
  });

  // ---- Vista calendário ----
  protected readonly month = signal(firstMonth(this.all));
  protected readonly weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  protected readonly selectedDay = signal<string | null>(null);
  protected readonly calendar = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(y, m, 0).getDate();
    const cells: { day: number; iso: string; items: AgendaItem[] }[] = [];
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, iso, items: this.items().filter((i) => i.date.startsWith(iso)) });
    }
    return { offset: Array(offset), cells, label: `${this.month()}-01` };
  });
  protected readonly dayItems = computed(() => {
    const d = this.selectedDay();
    return d ? this.items().filter((i) => i.date.startsWith(d)) : [];
  });

  protected readonly sportName = (slug?: string) => (slug ? this.content.sport(slug)?.name : 'Clube');
  /** Modalidade do filtro atual com site próprio (ex.: rugby → Almada Rugby) */
  protected readonly externalSport = computed(() => this.content.sport(this.filter())?.external);

  constructor() {
    inject(SeoService).set({
      title: 'Agenda',
      description: 'Calendário do Serrado FC: jogos, competições, treinos e eventos de atletismo, futsal, rugby e do clube.',
      path: '/agenda',
    });
  }

  shiftMonth(delta: number) {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    this.month.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    this.selectedDay.set(null);
  }

  protected linkPath(link: string) {
    return link.split('#')[0];
  }
  protected linkFragment(link: string) {
    return link.split('#')[1];
  }
}

function matches(i: AgendaItem, f: Filter) {
  switch (f) {
    case 'todos':
      return true;
    case 'clube':
      return !i.sportSlug || i.type === 'Reunião';
    case 'eventos':
      return i.type === 'Evento';
    default:
      return i.sportSlug === f;
  }
}

function firstMonth(items: AgendaItem[]) {
  const d = new Date();
  const now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return items[0]?.date.slice(0, 7) ?? now;
}
