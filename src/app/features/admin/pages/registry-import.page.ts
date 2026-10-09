import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';
import { readTable, toCsv } from '../../../shared/tabular';
import { IMPORT_EXAMPLE, IMPORT_FIELDS, ImportField, ImportKind, ImportResult, mapColumns, RegistryApi, toRows } from '../data/registry';

const MAX_BYTES = 5 * 1024 * 1024;
const LABEL: Record<ImportKind, string> = { members: 'sócios', athletes: 'atletas' };

/**
 * Importar sócios ou atletas de um ficheiro CSV ou XLSX. O ficheiro é lido no browser; o servidor
 * valida todas as linhas antes de gravar e, com algum erro, não grava nenhuma.
 */
@Component({
  selector: 'sfc-admin-registry-import',
  imports: [RouterLink, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Importar sócios e atletas</h1>
        <p>Ficheiro CSV ou Excel (.xlsx), com uma linha de cabeçalho. Importa primeiro os sócios e depois os atletas (que podem indicar o n.º de sócio).</p>
      </div>
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="A importação funciona com o site ligado à API (VPS)." />
    } @else {
      <section class="adm-panel block">
        <h2>1. O que vais importar</h2>
        <div class="chips" role="group" aria-label="Tipo">
          @if (auth.can('members.manage')) {
            <button type="button" class="chip" [attr.aria-pressed]="kind() === 'members'" (click)="setKind('members')">Sócios</button>
          }
          @if (auth.can('athletes.manage')) {
            <button type="button" class="chip" [attr.aria-pressed]="kind() === 'athletes'" (click)="setKind('athletes')">Atletas</button>
          }
        </div>
        <p class="caption">
          Colunas reconhecidas: {{ fieldLabels() }}. Os nomes dos cabeçalhos podem variar (ex.: «N.º Sócio», «Número de sócio»); as colunas que não se reconhecem são ignoradas.
          @if (kind() === 'members') {
            Sem n.º de sócio, é atribuído o seguinte. Com um n.º que já existe, a ficha é atualizada.
          } @else {
            Sem código, é atribuído o seguinte (SFC-0001…). Um atleta já existente (pelo código, ou pelo nome e data de nascimento) é atualizado. Com o email do encarregado, ele passa a ver a ficha na Área de Atletas.
          }
        </p>
        <button type="button" class="btn btn--outline btn--sm" (click)="template()"><sfc-icon name="download" size="16" />Descarregar modelo (CSV)</button>
      </section>

      <section class="adm-panel block">
        <h2>2. Ficheiro</h2>
        <label class="file">
          <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" (change)="onFile($event)" aria-label="Ficheiro CSV ou XLSX" />
        </label>
        <p class="caption"><sfc-icon name="shield" size="14" /> O ficheiro é lido neste browser e não fica guardado em lado nenhum; só seguem as colunas reconhecidas. Não o guardes em pastas partilhadas.</p>
        @if (fileError(); as e) {
          <p class="alert alert--warning" role="alert">{{ e }}</p>
        }
        @if (rows().length) {
          <ul class="facts">
            <li><strong>{{ rows().length }}</strong> linhas em <em>{{ fileName() }}</em></li>
            <li><strong>{{ recognized().length }}</strong> colunas reconhecidas</li>
            @if (ignored().length) {
              <li class="warn">Ignoradas: {{ ignored().join(', ') }}</li>
            }
          </ul>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th scope="col" class="num">Linha</th>
                  @for (f of recognized(); track f.key) {
                    <th scope="col">{{ f.label }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (r of rows().slice(0, 8); track $index) {
                  <tr [class.bad]="rowHasError($index + 1)">
                    <td class="num">{{ $index + 1 }}</td>
                    @for (f of recognized(); track f.key) {
                      <td>{{ r[f.key] }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (rows().length > 8) {
            <p class="caption">… e mais {{ rows().length - 8 }} linhas.</p>
          }
        }
      </section>

      @if (rows().length) {
        <section class="adm-panel block">
          <h2>3. Verificar e importar</h2>
          @if (!missingRequired().length) {
            <div class="actions">
              <button type="button" class="btn btn--outline" [disabled]="busy()" (click)="run(true)">Verificar</button>
              <button type="button" class="btn btn--primary" [disabled]="busy() || !checked() || !!checked()!.errors.length" (click)="run(false)">
                <sfc-icon name="upload" size="18" />Importar {{ rows().length }} {{ label() }}
              </button>
            </div>
          } @else {
            <p class="alert alert--warning">Falta a coluna obrigatória: {{ missingRequired().join(', ') }}.</p>
          }

          @if (result(); as r) {
            @if (r.errors.length) {
              <p class="alert alert--warning" role="alert">
                {{ r.errors.length }} problema(s) em {{ errorRows() }} linha(s). Corrige o ficheiro e volta a escolhê-lo: nada foi gravado.
              </p>
              <div class="adm-table-wrap">
                <table class="adm-table">
                  <thead><tr><th scope="col" class="num">Linha</th><th scope="col">Coluna</th><th scope="col">Problema</th></tr></thead>
                  <tbody>
                    @for (e of r.errors.slice(0, 100); track $index) {
                      <tr><td class="num">{{ e.row }}</td><td>{{ fieldLabel(e.field) }}</td><td>{{ e.message }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else if (r.dryRun) {
              <p class="alert alert--info" role="status">Tudo certo: {{ r.creates }} novo(s) e {{ r.updates }} a atualizar. Carrega em «Importar» para gravar.</p>
            } @else {
              <p class="alert alert--success" role="status">
                Importação concluída: {{ r.created }} novo(s) e {{ r.updated }} atualizado(s).
                <a [routerLink]="kind() === 'members' ? '/admin/socios' : '/admin/atletas'">Ver {{ label() }}</a>
              </p>
            }
          }
        </section>
      }
    }
  `,
  styles: `
    .chips {
      margin-bottom: 0.6rem;
    }
    .file input {
      font: inherit;
    }
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem 1.4rem;
      list-style: none;
      padding: 0;
      margin: 0.8rem 0;
      .warn {
        color: var(--color-danger);
      }
    }
    .actions {
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
      margin-bottom: 0.8rem;
    }
    tr.bad td {
      background: #fff4f2;
    }
    .alert {
      margin: 0.6rem 0;
    }
  `,
})
export class RegistryImportPage {
  protected readonly api = inject(RegistryApi);
  protected readonly auth = inject(AuthService);
  protected readonly kind = signal<ImportKind>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('tipo') === 'atletas' || !this.auth.can('members.manage') ? 'athletes' : 'members',
  );
  protected readonly fileName = signal('');
  protected readonly fileError = signal<string | null>(null);
  private readonly table = signal<string[][]>([]);
  protected readonly busy = signal(false);
  protected readonly result = signal<ImportResult | null>(null);
  /** Verificação sem erros das linhas atuais (é preciso verificar antes de importar) */
  protected readonly checked = computed(() => {
    const r = this.result();
    return r && r.dryRun ? r : null;
  });

  protected readonly columns = computed(() => (this.table().length ? mapColumns(this.kind(), this.table()[0]) : []));
  protected readonly recognized = computed(() => this.columns().filter((c): c is ImportField => !!c));
  protected readonly ignored = computed(() => this.table()[0]?.filter((_, i) => !this.columns()[i] && this.table()[0][i]) ?? []);
  protected readonly rows = computed(() => (this.table().length ? toRows(this.table(), this.columns()) : []));
  protected readonly missingRequired = computed(() =>
    IMPORT_FIELDS[this.kind()].filter((f) => f.required && !this.recognized().some((r) => r.key === f.key)).map((f) => f.label),
  );
  protected readonly fieldLabels = computed(() => IMPORT_FIELDS[this.kind()].map((f) => f.label).join(', '));
  protected readonly label = computed(() => LABEL[this.kind()]);
  protected readonly errorRows = computed(() => new Set(this.result()?.errors.map((e) => e.row)).size);

  setKind(k: ImportKind) {
    this.kind.set(k);
    this.result.set(null);
  }

  protected fieldLabel(key: string) {
    return IMPORT_FIELDS[this.kind()].find((f) => f.key === key)?.label ?? key;
  }

  protected rowHasError(row: number) {
    return !!this.result()?.errors.some((e) => e.row === row);
  }

  template() {
    const fields = IMPORT_FIELDS[this.kind()];
    const csv = toCsv([fields.map((f) => f.label), IMPORT_EXAMPLE[this.kind()]]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo-${this.kind() === 'members' ? 'socios' : 'atletas'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.result.set(null);
    this.fileError.set(null);
    this.table.set([]);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      this.fileError.set('Ficheiro demasiado grande (máximo 5 MB).');
      return;
    }
    try {
      const t = await readTable(file);
      if (t.length < 2) throw new Error('O ficheiro não tem linhas (só o cabeçalho, ou está vazio).');
      if (t.length > 2001) throw new Error('No máximo 2000 linhas de cada vez: divide o ficheiro.');
      this.fileName.set(file.name);
      this.table.set(t);
    } catch (e) {
      this.fileError.set((e as Error).message);
    } finally {
      input.value = '';
    }
  }

  async run(dryRun: boolean) {
    this.busy.set(true);
    try {
      this.result.set(await this.api.import(this.kind(), this.rows(), dryRun));
    } catch (e) {
      this.result.set(null);
      this.fileError.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
