import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, output, signal, viewChild } from '@angular/core';

/**
 * Quadro para assinar com o dedo, a caneta ou o rato. Emite o PNG (data URL) depois de cada traço,
 * ou null quando se limpa. O servidor volta a validar a imagem (tem de ter traço).
 */
@Component({
  selector: 'sfc-signature-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pad" [class.pad--signed]="signed()">
      <canvas
        #canvas
        width="600"
        height="220"
        role="img"
        aria-label="Quadro de assinatura: desenha a tua assinatura com o dedo, a caneta ou o rato"
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="up()"
        (pointercancel)="up()"
        (pointerleave)="up()"
      ></canvas>
      @if (!signed()) {
        <span class="pad__hint" aria-hidden="true">Assina aqui</span>
      }
      <span class="pad__line" aria-hidden="true"></span>
    </div>
    <button type="button" class="linkish" (click)="clear()" [disabled]="!signed()">Limpar e assinar de novo</button>
  `,
  styles: `
    .pad {
      position: relative;
      border: 1.5px dashed #9aa6bd;
      border-radius: var(--radius-s);
      background: #fff;
      touch-action: none;
      max-width: 600px;
    }
    .pad--signed {
      border-style: solid;
      border-color: var(--sfc-blue);
    }
    canvas {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 600 / 220;
      cursor: crosshair;
      touch-action: none;
    }
    .pad__hint {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #9aa6bd;
      font-size: 1.1rem;
      pointer-events: none;
    }
    .pad__line {
      position: absolute;
      left: 8%;
      right: 8%;
      bottom: 22%;
      border-bottom: 1px solid #c9cfdb;
      pointer-events: none;
    }
    .linkish {
      background: none;
      border: 0;
      color: var(--color-link);
      font-weight: 600;
      cursor: pointer;
      padding: 0.4rem 0;
      text-decoration: underline;
    }
    .linkish:disabled {
      color: var(--color-muted);
      cursor: default;
      text-decoration: none;
    }
  `,
})
export class SignaturePadComponent {
  readonly changed = output<string | null>();
  protected readonly signed = signal(false);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private last: { x: number; y: number } | null = null;
  private length = 0;

  constructor() {
    afterNextRender(() => {
      this.ctx = this.canvas().nativeElement.getContext('2d');
      if (this.ctx) {
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = '#0b1f3a';
      }
    });
  }

  private point(e: PointerEvent) {
    const c = this.canvas().nativeElement;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  protected down(e: PointerEvent) {
    if (!this.ctx) return;
    e.preventDefault();
    this.canvas().nativeElement.setPointerCapture?.(e.pointerId);
    this.drawing = true;
    this.last = this.point(e);
    this.ctx.beginPath();
    this.ctx.arc(this.last.x, this.last.y, 1.2, 0, Math.PI * 2);
    this.ctx.fillStyle = '#0b1f3a';
    this.ctx.fill();
  }

  protected move(e: PointerEvent) {
    if (!this.drawing || !this.ctx || !this.last) return;
    const p = this.point(e);
    this.ctx.beginPath();
    this.ctx.moveTo(this.last.x, this.last.y);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.length += Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.last = p;
  }

  protected up() {
    if (!this.drawing) return;
    this.drawing = false;
    this.last = null;
    // Um toque ou um risco minúsculo não é uma assinatura
    if (this.length > 80) {
      this.signed.set(true);
      this.changed.emit(this.canvas().nativeElement.toDataURL('image/png'));
    }
  }

  clear() {
    const c = this.canvas().nativeElement;
    this.ctx?.clearRect(0, 0, c.width, c.height);
    this.length = 0;
    this.signed.set(false);
    this.changed.emit(null);
  }
}
