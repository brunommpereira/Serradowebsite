import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { AdminSource } from '../data/admin-source';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Mesmas regras do servidor (services/serrado/mail.py): **negrito**, *itálico*, linha em branco = novo parágrafo. */
export function signatureHtml(model: Record<string, unknown>): string {
  const inline = (line: string) =>
    esc(line)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*(?!\*)(.+?)\*(?![*\w])/g, '$1<em>$2</em>');
  const paragraphs = String(model['text'] ?? '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  let out = paragraphs
    .map(
      (p) =>
        `<p>${p
          .split('\n')
          .map((l) => inline(l.trim()))
          .join('<br>')}</p>`,
    )
    .join('');
  if (model['showLogo']) {
    const size = Math.max(24, Math.min(240, Number(model['logoSize']) || 90));
    const src = String(model['logoUrl'] || 'brand/email-logo.png');
    out += `<img src="${esc(src)}" alt="Serrado FC" width="${size}" style="width:${size}px;height:auto">`;
  }
  return out;
}

/** Pré-visualização da assinatura e envio de um email de teste. */
@Component({
  selector: 'sfc-email-preview',
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <h2>Pré-visualização</h2>
    <div class="mail">
      <p class="mail__body">Olá Maria,<br />…texto do email…</p>
      <div class="mail__sig" [innerHTML]="html()"></div>
    </div>
    <button
      type="button"
      class="btn btn--outline btn--sm btn--block"
      [disabled]="busy()"
      (click)="test()"
    >
      Enviar-me um email de teste
    </button>
    <p class="caption">O teste usa a versão guardada: guarda primeiro as alterações.</p>
    @if (message(); as m) {
      <p class="caption" [class.err]="!m.ok" role="status">{{ m.text }}</p>
    }
  `,
  styles: `
    h2 {
      margin: 0 0 0.8rem;
      font-size: 1.15rem;
    }
    .mail {
      background: #f4f4f4;
      border-radius: var(--radius-s);
      padding: 0.8rem;
      margin-bottom: 0.8rem;
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
    }
    .mail__body {
      margin: 0 0 0.6rem;
      color: #555;
    }
    .mail__sig {
      border-top: 1px solid #e5e5e5;
      padding-top: 0.6rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
      :is(p) {
        margin: 0 0 0.6rem;
      }
    }
    .err {
      color: var(--color-danger);
    }
  `,
})
export class EmailPreviewComponent {
  readonly model = input.required<Record<string, unknown>>();
  private readonly source = inject(AdminSource);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);

  /** Lido a cada verificação (o modelo do formulário é mutável) */
  protected html() {
    return signatureHtml(this.model());
  }

  async test() {
    this.busy.set(true);
    try {
      const to = await this.source.siteEmailTest();
      this.message.set({ ok: true, text: `Enviado para ${to}. Chega dentro de um minuto.` });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }
}
