import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuotaPlan, RegistryApi } from '../data/registry';

/** Quota por categoria de sócio (mensal ou anual). As quotas criam-se com «Gerar» (e no dia 1 de cada mês). */
@Component({
  selector: 'sfc-quota-plans',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="adm-panel block">
      <h2>Quotas por categoria de sócio</h2>
      <p class="caption">Mensal: uma quota por mês («Outubro 2026», vence a dia 8). Anual: «Quota 2026», vence a 31 de janeiro. Só para sócios ativos.</p>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr><th scope="col">Categoria</th><th scope="col" class="num">Sócios ativos</th><th scope="col">Valor (€)</th><th scope="col">Periodicidade</th><th scope="col">Ativa</th><th scope="col" class="act"></th></tr>
          </thead>
          <tbody>
            @for (p of plans(); track p.category) {
              <tr>
                <td><strong>{{ p.category }}</strong></td>
                <td class="num">{{ p.members ?? 0 }}</td>
                <td><input type="number" min="0.5" max="999" step="0.5" [(ngModel)]="p.amount" [disabled]="!manage()" [attr.aria-label]="'Valor ' + p.category" /></td>
                <td>
                  <select [(ngModel)]="p.periodicity" [disabled]="!manage()" [attr.aria-label]="'Periodicidade ' + p.category">
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </td>
                <td><input type="checkbox" [(ngModel)]="p.active" [disabled]="!manage()" [attr.aria-label]="'Ativa ' + p.category" /></td>
                <td class="act">
                  @if (manage()) {
                    <button type="button" class="btn btn--outline btn--sm" (click)="save(p)">Guardar</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="adm-empty">Ainda sem quotas definidas.</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (manage()) {
        <form class="add" (submit)="$event.preventDefault(); add()">
          <label>Categoria <input name="c" [(ngModel)]="draft.category" required minlength="2" maxlength="40" placeholder="ex.: Efetivo" /></label>
          <label>Valor (€) <input name="a" type="number" min="0.5" max="999" step="0.5" [(ngModel)]="draft.amount" required /></label>
          <label>
            Periodicidade
            <select name="p" [(ngModel)]="draft.periodicity">
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </label>
          <button type="submit" class="btn btn--outline btn--sm">Acrescentar</button>
        </form>
      }
      @if (message(); as m) {
        <p class="caption" role="status">{{ m }}</p>
      }
    </section>
  `,
  styles: `
    td input[type='number'],
    td select {
      width: 7rem;
      min-height: 36px;
      padding: 0 0.4rem;
      border: 1.5px solid #c9cfdb;
      border-radius: var(--radius-s);
      font: inherit;
      background: #fff;
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.8rem;
      align-items: flex-end;
      margin-top: 0.8rem;
      label {
        display: grid;
        gap: 0.2rem;
        font-size: 0.85rem;
      }
      input,
      select {
        min-height: 38px;
        padding: 0 0.5rem;
        border: 1.5px solid #c9cfdb;
        border-radius: var(--radius-s);
        font: inherit;
        width: 10rem;
        background: #fff;
      }
    }
  `,
})
export class QuotaPlansComponent {
  private readonly api = inject(RegistryApi);
  readonly manage = input(false);
  protected readonly plans = signal<QuotaPlan[]>([]);
  protected readonly message = signal<string | null>(null);
  protected draft: QuotaPlan = { category: '', amount: 0, periodicity: 'mensal', active: true };

  constructor() {
    this.load();
  }

  private async load() {
    this.plans.set(await this.api.quotaPlans().catch(() => []));
  }

  async save(p: QuotaPlan) {
    try {
      await this.api.saveQuotaPlan({ ...p, amount: Number(p.amount) });
      this.message.set(`Quota «${p.category}» guardada.`);
      await this.load();
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }

  async add() {
    await this.save({ ...this.draft, category: this.draft.category.trim() });
    this.draft = { category: '', amount: 0, periodicity: 'mensal', active: true };
  }
}
