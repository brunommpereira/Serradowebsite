import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BlockField } from '../../../core/site/site.models';
import { IconComponent } from '../../../shared/icon.component';
import { AdminSource } from '../data/admin-source';
import { MediaPickerComponent } from '../media/media-picker.component';

let seq = 0;

/** Um campo de um bloco de conteúdo (todos os tipos menos listas), ligado a `model[field.key]`. */
@Component({
  selector: 'sfc-block-field',
  imports: [FormsModule, IconComponent, MediaPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'field',
    '[class.wide]': 'field().wide',
    '[class.field--check]': "field().kind === 'checkbox'",
  },
  template: `
    @let f = field();
    @let m = model();
    @if (f.kind === 'checkbox') {
      <label class="check">
        <input
          type="checkbox"
          [id]="id"
          [(ngModel)]="m[f.key]"
          [ngModelOptions]="{ standalone: true }"
        />
        <span>{{ f.label }}</span>
      </label>
    } @else {
      <label [for]="id"
        >{{ f.label }}
        @if (f.required) {
          <span class="req">*</span>
        }
      </label>
      @switch (f.kind) {
        @case ('textarea') {
          <textarea
            [id]="id"
            [rows]="(f.max ?? 0) > 1000 ? 6 : 3"
            [attr.maxlength]="f.max"
            [(ngModel)]="m[f.key]"
            [ngModelOptions]="{ standalone: true }"
          ></textarea>
        }
        @case ('lines') {
          <textarea
            [id]="id"
            rows="4"
            [ngModel]="linesText(m[f.key])"
            (ngModelChange)="m[f.key] = splitLines($event)"
            [ngModelOptions]="{ standalone: true, updateOn: 'blur' }"
          ></textarea>
        }
        @case ('select') {
          <select [id]="id" [(ngModel)]="m[f.key]" [ngModelOptions]="{ standalone: true }">
            @if (!f.required) {
              <option [ngValue]="null">—</option>
            }
            @for (o of f.options; track o) {
              <option [ngValue]="o">{{ f.optionLabels?.[o] ?? o }}</option>
            }
          </select>
        }
        @case ('number') {
          <input
            [id]="id"
            type="number"
            step="any"
            [(ngModel)]="m[f.key]"
            [ngModelOptions]="{ standalone: true }"
          />
        }
        @case ('date') {
          <input
            [id]="id"
            type="date"
            [(ngModel)]="m[f.key]"
            [ngModelOptions]="{ standalone: true }"
          />
        }
        @case ('datetime') {
          <input
            [id]="id"
            type="datetime-local"
            [(ngModel)]="m[f.key]"
            [ngModelOptions]="{ standalone: true }"
          />
        }
        @case ('url') {
          <input
            [id]="id"
            type="url"
            placeholder="https://"
            [attr.maxlength]="f.max"
            [(ngModel)]="m[f.key]"
            [ngModelOptions]="{ standalone: true }"
          />
        }
        @case ('email') {
          <input
            [id]="id"
            type="email"
            [attr.maxlength]="f.max"
            [(ngModel)]="m[f.key]"
            [ngModelOptions]="{ standalone: true }"
          />
        }
        @case ('image') {
          <div class="media">
            @if (m[f.key]) {
              <img class="media__img" [src]="m[f.key]" alt="Pré-visualização" />
            } @else {
              <div class="media__empty">
                <sfc-icon name="image" size="24" /><span>Sem imagem</span>
              </div>
            }
            <div class="media__actions">
              <button
                type="button"
                class="btn btn--outline btn--sm"
                [id]="id"
                (click)="picker.show()"
              >
                {{ m[f.key] ? 'Trocar' : 'Escolher imagem' }}
              </button>
              @if (m[f.key]) {
                <button type="button" class="linkish linkish--danger" (click)="m[f.key] = null">
                  Remover
                </button>
              }
            </div>
          </div>
          <sfc-media-picker #picker (picked)="m[f.key] = $event.url" />
        }
        @case ('file') {
          <div class="file">
            @if (m[f.key]) {
              <a class="file__link" [href]="m[f.key]" target="_blank" rel="noopener"
                ><sfc-icon name="file" size="18" />Ver o PDF</a
              >
              <button type="button" class="linkish linkish--danger" (click)="m[f.key] = null">
                Remover
              </button>
            }
            <label class="btn btn--outline btn--sm file__pick">
              <sfc-icon name="upload" size="16" />{{
                uploading() ? 'A carregar…' : m[f.key] ? 'Trocar PDF' : 'Carregar PDF'
              }}
              <input
                [id]="id"
                type="file"
                accept="application/pdf,.pdf"
                (change)="upload($event)"
                [disabled]="uploading()"
              />
            </label>
          </div>
          @if (uploadError(); as e) {
            <span class="error">{{ e }}</span>
          }
        }
        @default {
          <input
            [id]="id"
            [attr.maxlength]="f.max"
            [(ngModel)]="m[f.key]"
            [ngModelOptions]="{ standalone: true }"
          />
        }
      }
      @if (f.hint) {
        <span class="hint">{{ f.hint }}</span>
      }
    }
  `,
  styles: `
    :host {
      min-width: 0;
    }
    textarea {
      width: 100%;
    }
    .media {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem 1rem;
    }
    .media__img,
    .media__empty {
      width: 160px;
      aspect-ratio: 4 / 3;
      border-radius: var(--radius-s);
      object-fit: cover;
      background: #eef1f6;
    }
    .media__empty {
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 0.2rem;
      color: var(--color-muted);
      font-size: 0.82rem;
      border: 1.5px dashed #c9cfdb;
    }
    .media__actions,
    .file {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.9rem;
    }
    .file__link {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-weight: 700;
    }
    .file__pick {
      position: relative;
      cursor: pointer;
      input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      &:focus-within {
        outline: 3px solid var(--sfc-yellow);
      }
    }
  `,
})
export class BlockFieldComponent {
  readonly field = input.required<BlockField>();
  readonly model = input.required<Record<string, unknown>>();

  private readonly source = inject(AdminSource);
  protected readonly id = `bf-${++seq}`;
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);

  protected linesText(v: unknown) {
    return Array.isArray(v) ? v.join('\n') : '';
  }

  protected splitLines(text: string) {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  protected async upload(ev: Event) {
    const inputEl = ev.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    this.uploadError.set(null);
    if (file.size > 10 * 1024 * 1024) {
      this.uploadError.set(
        'O PDF tem mais de 10 MB. Reduz o tamanho (por exemplo, «Guardar como PDF reduzido») e tenta de novo.',
      );
      return;
    }
    this.uploading.set(true);
    try {
      const base64 = await toBase64(file);
      const item = await this.source.mediaUploadFile({ name: file.name, base64 });
      this.model()[this.field().key] = item.url;
    } catch (e) {
      this.uploadError.set((e as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
    r.readAsDataURL(file);
  });
}
