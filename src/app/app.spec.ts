import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('cria a aplicação com cabeçalho e rodapé', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('sfc-header')).toBeTruthy();
    expect(el.querySelector('sfc-footer')).toBeTruthy();
    expect(el.querySelector('main#conteudo')).toBeTruthy();
  });
});
