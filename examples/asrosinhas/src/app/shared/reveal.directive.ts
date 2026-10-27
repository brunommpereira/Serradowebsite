import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

/** Entrada suave quando o elemento aparece no ecrã. Sem JS (ou com «reduzir movimento»), o conteúdo vê-se logo. */
@Directive({ selector: '[arReveal]' })
export class RevealDirective {
  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    afterNextRender(() => {
      if (
        !('IntersectionObserver' in window) ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        return;
      const box = el.getBoundingClientRect();
      if (box.top < innerHeight) return; // já visível: sem animação
      el.classList.add('reveal');
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            el.classList.add('is-in');
            io.disconnect();
          }
        },
        { rootMargin: '0px 0px -8% 0px' },
      );
      io.observe(el);
    });
  }
}
