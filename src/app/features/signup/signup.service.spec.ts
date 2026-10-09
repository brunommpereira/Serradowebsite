import { TestBed } from '@angular/core/testing';
import { LegalAcceptComponent } from './legal-accept.component';
import { paragraphs } from './signup.service';

describe('registo online', () => {
  it('divide o texto dos documentos em parágrafos', () => {
    expect(paragraphs('Primeiro.\n\n2. Segundo\ncontinua.\n\n\n  \n3. Terceiro')).toEqual(['Primeiro.', '2. Segundo\ncontinua.', '3. Terceiro']);
  });

  it('mostra o documento e regista a aceitação', () => {
    const f = TestBed.createComponent(LegalAcceptComponent);
    f.componentRef.setInput('doc', { version: 3, title: 'RGPD', body: 'Um.\n\nDois.', sha256: 'x' });
    f.componentRef.setInput('label', 'Li a informação');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('summary')?.textContent).toContain('versão 3');
    expect(el.querySelectorAll('.doc__body p').length).toBe(2);
    const box = el.querySelector('input[type=checkbox]') as HTMLInputElement;
    box.click();
    expect(f.componentInstance.accepted()).toBe(true);
  });
});
