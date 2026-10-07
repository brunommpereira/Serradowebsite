import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon.component';
import { DialogComponent } from '../../../shared/dialog.component';
import { AdminAthlete, AdminAthleteDetail, AdminSource, DOC_LABELS, FIELD_LABELS } from '../data/admin-source';

const SPORTS: Record<string, string> = { atletismo: 'Atletismo', futsal: 'Futsal', rugby: 'Rugby', formacao: 'Formação', 'escola-de-desporto': 'Escola de Desporto' };

/** Atletas do clube (secretaria e treinadores; o treinador não vê dados sensíveis). */
@Component({
  selector: 'sfc-admin-athletes',
  imports: [DatePipe, FormsModule, IconComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Atletas</h1>
        <p>{{ list().length }} atleta(s){{ auth.hasRole('secretaria') ? '' : ' · vista de treinador (sem dados sensíveis)' }}</p>
      </div>
    </div>

    <div class="adm-toolbar">
      <label class="visually-hidden" for="ath-q">Pesquisar atleta</label>
      <input id="ath-q" class="adm-search" type="search" placeholder="Nome ou código (SFC-0001)…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      <label class="visually-hidden" for="ath-sport">Modalidade</label>
      <select id="ath-sport" class="sel" [ngModel]="sport()" (ngModelChange)="sport.set($event)">
        <option value="">Todas as modalidades</option>
        @for (s of sports; track s[0]) {
          <option [value]="s[0]">{{ s[1] }}</option>
        }
      </select>
      <div class="chips" role="group" aria-label="Pendentes">
        <button type="button" class="chip" [attr.aria-pressed]="!pending()" (click)="pending.set('')">Todos</button>
        <button type="button" class="chip" [attr.aria-pressed]="pending() === 'confirm'" (click)="pending.set('confirm')">Ficha por confirmar</button>
        <button type="button" class="chip" [attr.aria-pressed]="pending() === 'docs'" (click)="pending.set('docs')">Documentos em falta</button>
        <button type="button" class="chip" [attr.aria-pressed]="pending() === 'requests'" (click)="pending.set('requests')">Com pedidos</button>
      </div>
    </div>

    @if (error()) {
      <p class="alert alert--warning adm-error" role="alert">{{ error() }}</p>
    }

    <div class="adm-table-wrap">
      <table class="adm-table">
        <caption class="visually-hidden">Atletas</caption>
        <thead>
          <tr>
            <th scope="col">Atleta</th>
            <th scope="col" class="hide-sm">Modalidade</th>
            <th scope="col">Ficha {{ season }}</th>
            <th scope="col" class="num hide-sm">Documentos</th>
            <th scope="col" class="act"><span class="visually-hidden">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          @for (a of list(); track a.id) {
            <tr>
              <td>
                <strong>{{ a.name }}</strong>
                <span class="caption sub">{{ a.code }} · {{ a.birthDate | date: 'y' }}</span>
              </td>
              <td class="hide-sm">{{ sportName(a.sportSlug) }} · {{ a.category }}</td>
              <td>
                @if (a.confirmed) {
                  <span class="st st--ok">Confirmada</span>
                } @else {
                  <span class="st st--warn">Por confirmar</span>
                }
                @if (a.pendingRequests) {
                  <span class="st st--bad">Pedido</span>
                }
              </td>
              <td class="num hide-sm">{{ a.docsApproved }}/{{ a.docsTotal }}{{ a.docsToReview ? ' · ' + a.docsToReview + ' a validar' : '' }}</td>
              <td class="act"><button type="button" class="btn btn--outline btn--sm" (click)="open(a.id)">Ver ficha</button></td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="adm-empty">{{ loading() ? 'A carregar…' : 'Nenhum atleta com estes filtros.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    <sfc-dialog [heading]="detail()?.name ?? 'Atleta'" [open]="!!detail()" (closed)="detail.set(null)">
      @if (detail(); as d) {
        <p class="caption">{{ d.code }} · {{ d['category'] }} · acesso: {{ d.access === 'treinador' ? 'treinador (dados sensíveis ocultos)' : 'secretaria' }}</p>
        @if (d.missing.length) {
          <p class="alert alert--warning"><sfc-icon name="warning" size="18" />Em falta na ficha: {{ d.missing.join(', ') }}</p>
        }
        <dl class="dl">
          @for (f of fields; track f[0]) {
            @if (d[f[0]] !== undefined) {
              <div><dt>{{ f[1] }}</dt><dd>{{ d[f[0]] === true ? 'Sim' : d[f[0]] === false ? 'Não' : d[f[0]] || '—' }}</dd></div>
            }
          }
        </dl>
        <h3 class="h-s">Documentos</h3>
        <ul class="docs">
          @for (doc of d.documents; track doc.id) {
            <li>
              <span>{{ docLabel(doc.kind) }}</span>
              <span class="st" [class]="'st ' + docClass(doc.status)">{{ doc.status }}</span>
            </li>
          }
        </ul>
        @if (d.pendingRequests.length) {
          <h3 class="h-s">Pedido de alteração pendente</h3>
          @for (r of d.pendingRequests; track r.id) {
            <p>{{ changes(r.changes) }} <span class="caption">({{ r.requestedAt | date: 'dd/MM' }})</span></p>
          }
        }
      }
    </sfc-dialog>
  `,
  styles: `
    .sel {
      min-height: 42px;
      padding: 0 0.7rem;
      border: 1.5px solid #c9cfdb;
      border-radius: var(--radius-s);
      font: inherit;
      background: #fff;
    }
    .sub {
      display: block;
    }
    td .st + .st {
      margin-left: 0.3rem;
    }
    .dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.4rem 1rem;
      margin: 0 0 1rem;
      div {
        display: grid;
        grid-template-columns: 8rem 1fr;
        gap: 0.5rem;
        font-size: 0.9rem;
      }
      dt {
        color: var(--color-muted);
      }
      dd {
        margin: 0;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
    }
    .docs {
      list-style: none;
      margin: 0 0 1rem;
      padding: 0;
      li {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.4rem 0;
        border-top: 1px solid var(--color-line);
        font-size: 0.9rem;
      }
    }
    @media (max-width: 640px) {
      .hide-sm {
        display: none;
      }
    }
  `,
})
export class AthletesPage {
  protected readonly auth = inject(AuthService);
  private readonly source = inject(AdminSource);
  protected readonly sports = Object.entries(SPORTS);
  protected readonly season = '2026/27';
  protected readonly fields: [string, string][] = [
    ['birthDate', 'Nascimento'],
    ['gender', 'Género'],
    ['email', 'Email'],
    ['phone', 'Telemóvel'],
    ['idNumber', 'N.º CC'],
    ['taxNumber', 'NIF'],
    ['address', 'Morada'],
    ['postalCode', 'Código postal'],
    ['city', 'Localidade'],
    ['emergencyName', 'Emergência'],
    ['emergencyPhone', 'Tel. emergência'],
    ['shirtSize', 'T-shirt'],
    ['consentRgpd', 'RGPD'],
    ['consentImage', 'Imagem'],
    ['confirmedAt', 'Confirmada em'],
  ];

  protected readonly q = signal('');
  protected readonly sport = signal('');
  protected readonly pending = signal('');
  protected readonly list = signal<AdminAthlete[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly detail = signal<AdminAthleteDetail | null>(null);

  constructor() {
    effect(() => {
      const filter = { q: this.q().trim() || undefined, sport: this.sport() || undefined, pending: this.pending() || undefined };
      this.loading.set(true);
      this.source
        .athletes(filter)
        .then((l) => {
          this.list.set(l);
          this.error.set('');
        })
        .catch((e: Error) => this.error.set(e.message))
        .finally(() => this.loading.set(false));
    });
  }

  protected sportName = (s: string) => SPORTS[s] ?? s;
  protected docLabel = (k: string) => DOC_LABELS[k] ?? k;
  protected docClass = (s: string) => (s === 'Aprovado' ? 'st--ok' : s === 'Rejeitado' ? 'st--bad' : s === 'Em análise' ? 'st--warn' : 'st--muted');
  protected changes = (c: Record<string, string>) =>
    Object.entries(c)
      .map(([k, v]) => `${FIELD_LABELS[k] ?? k} → ${v}`)
      .join('; ');

  async open(id: string) {
    try {
      this.detail.set(await this.source.athlete(id));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
