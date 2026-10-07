import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import type { Editor } from '@tiptap/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../shared/icon.component';
import { htmlToText } from '../../../core/cms/rich-text';
import { MediaItem } from '../data/admin-source';
import { MediaPickerComponent } from './media-picker.component';

type Block = 'p' | 'h2' | 'h3';

/**
 * Editor visual (Tiptap/ProseMirror) para o texto das notícias, eventos e páginas.
 * Produz HTML simples: parágrafos, títulos, negrito, itálico, sublinhado, listas, citações,
 * ligações e imagens da biblioteca. O backend volta a limpar o HTML antes de o gravar.
 */
@Component({
  selector: 'sfc-rich-text-editor',
  imports: [FormsModule, IconComponent, MediaPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rte" [class.rte--focus]="focused()">
      <!-- mousedown sem efeito: os botões não tiram o foco (nem a seleção) ao texto -->
      <div class="bar" role="toolbar" [attr.aria-label]="'Formatação do texto'" [attr.aria-controls]="inputId()" (mousedown)="keepFocus($event)">
        <label class="visually-hidden" [for]="inputId() + '-block'">Tipo de bloco</label>
        <select [id]="inputId() + '-block'" [ngModel]="block()" (ngModelChange)="setBlock($event)" [disabled]="!ready()">
          <option value="p">Parágrafo</option>
          <option value="h2">Título</option>
          <option value="h3">Subtítulo</option>
        </select>
        <span class="sep" aria-hidden="true"></span>
        @for (b of marks; track b.cmd) {
          <button type="button" class="tb" [attr.aria-label]="b.label" [title]="b.label + ' (' + b.keys + ')'" [attr.aria-pressed]="active()[b.cmd]" [disabled]="!ready()" (click)="toggle(b.cmd)">
            <sfc-icon [name]="b.icon" size="18" />
          </button>
        }
        <span class="sep" aria-hidden="true"></span>
        <button type="button" class="tb" aria-label="Ligação" title="Ligação (Ctrl+K)" [attr.aria-pressed]="active()['link'] || linkOpen()" [disabled]="!ready()" (click)="openLink()">
          <sfc-icon name="link" size="18" />
        </button>
        <button type="button" class="tb tb--text" [disabled]="!ready()" (click)="picker.show()"><sfc-icon name="image" size="18" />Imagem</button>
        <span class="grow"></span>
        <button type="button" class="tb" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" [disabled]="!can().undo" (click)="run('undo')"><sfc-icon name="undo" size="18" /></button>
        <button type="button" class="tb" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" [disabled]="!can().redo" (click)="run('redo')"><sfc-icon name="redo" size="18" /></button>
      </div>

      @if (linkOpen()) {
        <form class="linkbar" (ngSubmit)="applyLink()">
          <label [for]="inputId() + '-href'">Endereço</label>
          <input #href [id]="inputId() + '-href'" name="href" type="text" inputmode="url" placeholder="https://… ou /eventos" [(ngModel)]="href_" autocomplete="off" />
          <button type="submit" class="btn btn--primary btn--sm">Aplicar</button>
          @if (active()['link']) {
            <button type="button" class="linkish linkish--danger" (click)="removeLink()">Remover ligação</button>
          }
          <button type="button" class="linkish" (click)="linkOpen.set(false)">Cancelar</button>
        </form>
      }

      <div #host class="host"></div>
      @if (!ready()) {
        <p class="caption loading">A abrir o editor…</p>
      }
      <p class="foot caption">{{ words() }} {{ words() === 1 ? 'palavra' : 'palavras' }} · Enter cria um parágrafo novo; Shift+Enter muda de linha.</p>
    </div>
    <sfc-media-picker #picker (picked)="insertImage($event)" />
  `,
  styles: `
    :host { display: block; }
    .rte { border: 1.5px solid #c9cfdb; border-radius: var(--radius-s); background: #fff; }
    .rte--focus { border-color: var(--sfc-blue); box-shadow: 0 0 0 3px rgba(0, 74, 142, 0.18); }
    .bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.15rem; padding: 0.35rem;
      border-bottom: 1px solid var(--color-line); background: #f8f9fc; border-radius: var(--radius-s) var(--radius-s) 0 0;
      position: sticky; top: 0; z-index: 2;
      select { width: auto; flex: none; min-height: 36px; padding: 0 0.5rem; border: 1px solid #c9cfdb; border-radius: 6px; font: inherit; font-size: 0.88rem; background: #fff; }
    }
    .tb {
      min-width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
      padding: 0 0.45rem; border: 0; border-radius: 6px; background: none; color: #2a3445; cursor: pointer; font: 600 0.85rem var(--font-body);
      &:hover:not(:disabled) { background: #e6ebf3; }
      &[aria-pressed='true'] { background: var(--sfc-blue); color: #fff; }
      &:disabled { opacity: 0.4; cursor: default; }
      &:focus-visible { outline: 3px solid rgba(0, 74, 142, 0.35); }
    }
    .sep { width: 1px; height: 22px; background: #d5dae4; margin: 0 0.25rem; }
    .grow { flex: 1; }
    .linkbar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--color-line);
      label { font-weight: 600; font-size: 0.85rem; }
      input { flex: 1 1 220px; min-height: 36px; padding: 0 0.6rem; border: 1.5px solid #c9cfdb; border-radius: 6px; font: inherit; }
    }
    .host ::ng-deep .ProseMirror {
      min-height: 280px; max-height: 70vh; overflow-y: auto; padding: 0.9rem 1rem; outline: none; box-shadow: none; border-radius: 0; font-size: 1rem; line-height: 1.6;
      > :first-child { margin-top: 0; }
      img.ProseMirror-selectednode { outline: 3px solid var(--sfc-blue); }
      p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #8a93a3; float: left; height: 0; pointer-events: none; }
    }
    .loading { padding: 0.9rem 1rem; margin: 0; }
    .foot { margin: 0; padding: 0.35rem 0.8rem; border-top: 1px solid var(--color-line); }
  `,
})
export class RichTextEditorComponent {
  readonly value = input('');
  readonly inputId = input('rte');
  readonly label = input('Texto');
  readonly valueChange = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly hrefInput = viewChild<ElementRef<HTMLInputElement>>('href');
  private editor: Editor | null = null;
  /** último HTML emitido (para não reaplicar o próprio valor) */
  private lastHtml = '';

  protected readonly ready = signal(false);
  protected readonly focused = signal(false);
  protected readonly block = signal<Block>('p');
  protected readonly active = signal<Record<string, boolean>>({});
  protected readonly can = signal({ undo: false, redo: false });
  protected readonly words = signal(0);
  protected readonly linkOpen = signal(false);
  protected href_ = '';

  protected readonly marks = [
    { cmd: 'bold', icon: 'bold', label: 'Negrito', keys: 'Ctrl+B' },
    { cmd: 'italic', icon: 'italic', label: 'Itálico', keys: 'Ctrl+I' },
    { cmd: 'underline', icon: 'underline', label: 'Sublinhado', keys: 'Ctrl+U' },
    { cmd: 'bulletList', icon: 'list', label: 'Lista', keys: 'Ctrl+Shift+8' },
    { cmd: 'orderedList', icon: 'list-ordered', label: 'Lista numerada', keys: 'Ctrl+Shift+7' },
    { cmd: 'blockquote', icon: 'quote', label: 'Citação', keys: 'Ctrl+Shift+B' },
  ] as const;

  constructor() {
    afterNextRender(() => this.init());
    inject(DestroyRef).onDestroy(() => this.editor?.destroy());
    // Valor alterado de fora (carregar outro conteúdo, repor versão)
    effect(() => {
      const v = this.value();
      if (this.editor && v !== this.lastHtml) {
        this.lastHtml = v;
        this.editor.commands.setContent(v, { emitUpdate: false });
        this.sync();
      }
    });
  }

  private async init() {
    const [{ Editor }, { default: StarterKit }, { default: Image }, { Placeholder }] = await Promise.all([
      import('@tiptap/core'),
      import('@tiptap/starter-kit'),
      import('@tiptap/extension-image'),
      import('@tiptap/extensions'),
    ]);
    this.lastHtml = this.value();
    this.editor = new Editor({
      element: this.host().nativeElement,
      content: this.value(),
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          code: false,
          codeBlock: false,
          strike: false,
          link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: null, target: null } },
        }),
        Image.configure({ allowBase64: true }),
        Placeholder.configure({ placeholder: 'Escreve aqui o texto…' }),
      ],
      editorProps: {
        attributes: { id: this.inputId(), role: 'textbox', 'aria-multiline': 'true', 'aria-label': this.label(), class: 'rich' },
        handleKeyDown: (_view, e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            this.openLink();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        // Sem o parágrafo vazio que o editor mantém no fim
        const html = editor.isEmpty ? '' : editor.getHTML().replace(/(<p><\/p>)+$/, '');
        this.lastHtml = html;
        this.valueChange.emit(html);
      },
      onTransaction: () => this.sync(),
      onFocus: () => this.focused.set(true),
      onBlur: () => this.focused.set(false),
    });
    this.sync();
    this.ready.set(true);
  }

  protected keepFocus(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault();
  }

  private sync() {
    const e = this.editor;
    if (!e) return;
    this.block.set(e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p');
    this.active.set(Object.fromEntries(['bold', 'italic', 'underline', 'bulletList', 'orderedList', 'blockquote', 'link'].map((n) => [n, e.isActive(n)])));
    this.can.set({ undo: e.can().undo(), redo: e.can().redo() });
    this.words.set(htmlToText(e.getHTML()).split(' ').filter(Boolean).length);
  }

  protected setBlock(b: Block) {
    const c = this.editor?.chain().focus();
    if (!c) return;
    (b === 'p' ? c.setParagraph() : c.setHeading({ level: b === 'h2' ? 2 : 3 })).run();
  }

  protected toggle(cmd: (typeof this.marks)[number]['cmd']) {
    const c = this.editor?.chain().focus();
    if (!c) return;
    ({
      bold: () => c.toggleBold(),
      italic: () => c.toggleItalic(),
      underline: () => c.toggleUnderline(),
      bulletList: () => c.toggleBulletList(),
      orderedList: () => c.toggleOrderedList(),
      blockquote: () => c.toggleBlockquote(),
    })[cmd]().run();
  }

  protected run(cmd: 'undo' | 'redo') {
    const c = this.editor?.chain().focus();
    (cmd === 'undo' ? c?.undo() : c?.redo())?.run();
  }

  protected openLink() {
    this.href_ = (this.editor?.getAttributes('link')['href'] as string | undefined) ?? '';
    this.linkOpen.set(true);
    queueMicrotask(() => this.hrefInput()?.nativeElement.focus());
  }

  protected applyLink() {
    const e = this.editor;
    let href = this.href_.trim();
    if (!e) return;
    if (!href) return this.removeLink();
    if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(href)) href = 'https://' + href;
    // Ligações para fora do site abrem noutra janela
    const external = /^https?:\/\//i.test(href) && !href.startsWith(location.origin);
    const attrs = { href, target: external ? '_blank' : null };
    const chain = e.chain().focus().extendMarkRange('link');
    if (e.state.selection.empty && !e.isActive('link')) chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs }] }).run();
    // O cursor fica a seguir à ligação, para se continuar a escrever
    else chain.setLink(attrs).setTextSelection(e.state.selection.to).run();
    this.linkOpen.set(false);
  }

  protected removeLink() {
    this.editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    this.linkOpen.set(false);
  }

  protected insertImage(m: MediaItem) {
    this.editor?.chain().focus().setImage({ src: m.url, alt: m.alt }).run();
  }
}
