import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { DR_EXTRACT, LAST_ASSEMBLY, NOTE_1987, REGULATION, STATUTES } from './statutes.data';

/** /clube/estatutos — os documentos que regem o clube, transcritos dos originais (ver statutes.data.ts). */
@Component({
  selector: 'sfc-statutes',
  imports: [RouterLink, IconComponent, PageHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero
      eyebrow="Transparência"
      title="Estatutos e Regulamento Interno"
      subtitle="Os documentos que regem o Serrado Futebol Clube, transcritos dos originais."
      [crumbs]="[{ label: 'O Clube', link: '/clube' }, { label: 'Estatutos' }]"
    />
    <section class="section">
      <div class="container layout">
        <nav class="toc" aria-label="Índice">
          <p class="toc__title">Índice</p>
          <ol>
            <li><a fragment="estatutos" routerLink=".">Estatutos (1985)</a></li>
            <li><a fragment="diario-da-republica" routerLink=".">Diário da República</a></li>
            <li><a fragment="nota-1987" routerLink=".">Nota sobre os Estatutos (1987)</a></li>
            <li>
              <a fragment="regulamento" routerLink=".">Regulamento Interno (1999)</a>
              <ol>
                @for (c of regulation; track c.id) {
                  <li>
                    <a [fragment]="c.id" routerLink=".">{{ c.title.replace('Capítulo ', '') }}</a>
                  </li>
                }
              </ol>
            </li>
            <li><a fragment="assembleia-2025" routerLink=".">Assembleia Geral de 2025</a></li>
          </ol>
          <button type="button" class="btn btn--outline btn--sm print" (click)="print()">
            <sfc-icon name="download" size="16" />Imprimir / PDF
          </button>
        </nav>

        <div class="doc">
          <p class="alert">
            Transcrição dos documentos originais, com a grafia da época (anterior ao Acordo
            Ortográfico). Os originais assinados estão na sede e podem ser consultados pelos sócios.
          </p>

          <section id="estatutos" aria-labelledby="h-est">
            <p class="eyebrow">Escritura de 30 de abril de 1985</p>
            <h2 id="h-est">Estatutos do S.F.C.</h2>
            @for (a of statutes; track a.n) {
              <p class="art"><strong>{{ a.n }}.</strong> {{ a.text }}</p>
            }
          </section>

          <section id="diario-da-republica" aria-labelledby="h-dr">
            <p class="eyebrow">Diário da República, III Série, n.º 126, 1 de junho de 1985</p>
            <h2 id="h-dr">Publicação da constituição</h2>
            <blockquote>
              <p><strong>SERRADO FUTEBOL CLUBE</strong> — {{ dr }}</p>
              <p class="caption">1.º Cartório Notarial de Almada, 14 de maio de 1985.</p>
            </blockquote>
          </section>

          <section id="nota-1987" aria-labelledby="h-nota">
            <p class="eyebrow">Mesa da Assembleia Geral</p>
            <h2 id="h-nota">Nota importante acerca dos Estatutos</h2>
            <p>{{ note.intro }}</p>
            <ul class="items">
              @for (p of note.points; track $index) {
                <li>{{ p }}</li>
              }
            </ul>
            <p>Assim, os documentos que regem a vida do Serrado Futebol Clube são:</p>
            <ul class="items">
              @for (p of note.documents; track $index) {
                <li>{{ p }}</li>
              }
            </ul>
            <p>{{ note.closing }}</p>
            <p class="caption">{{ note.signed }}</p>
          </section>

          <section id="regulamento" aria-labelledby="h-reg">
            <p class="eyebrow">Versão de 12 de abril de 1999</p>
            <h2 id="h-reg">Regulamento Interno</h2>
            @for (c of regulation; track c.id) {
              <h3 [id]="c.id">{{ c.title }}</h3>
              @for (a of c.articles; track a.n) {
                @if (a.section) {
                  <h4>{{ a.section }}</h4>
                }
                <div class="art" [id]="'art-' + a.n">
                  <p>
                    <strong>Art.º {{ a.n }}.º</strong>
                    @if (a.title) {
                      <strong> — {{ a.title }}</strong>
                    }
                    @if (a.text) {
                      — {{ a.text }}
                    }
                  </p>
                  @if (a.items) {
                    <ul class="items">
                      @for (i of a.items; track $index) {
                        <li>{{ i }}</li>
                      }
                    </ul>
                  }
                </div>
              }
            }
          </section>

          <section id="assembleia-2025" aria-labelledby="h-ag">
            <p class="eyebrow">Resumo da ata</p>
            <h2 id="h-ag">{{ assembly.title }}</h2>
            <p>Ordem de trabalhos:</p>
            <ol class="items">
              @for (p of assembly.agenda; track $index) {
                <li>{{ p }}</li>
              }
            </ol>
            @for (p of assembly.summary; track $index) {
              <p>{{ p }}</p>
            }
            <p class="caption">
              A ata completa, com a lista de presenças, pode ser consultada pelos sócios na sede.
            </p>
          </section>

          <p class="back">
            <a class="btn btn--outline" routerLink="/clube" fragment="transparencia">
              Voltar a Estatutos e documentos
            </a>
          </p>
        </div>
      </div>
    </section>
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      gap: 2.5rem;
      align-items: start;
    }
    .toc {
      position: sticky;
      top: 6rem;
      max-height: calc(100vh - 7rem);
      overflow: auto;
      font-size: 0.92rem;
      ol {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.35rem;
      }
      ol ol {
        margin: 0.4rem 0 0.2rem 0.8rem;
        font-size: 0.86rem;
      }
      a {
        color: var(--color-muted);
        text-decoration: none;
        &:hover {
          color: var(--color-text);
          text-decoration: underline;
        }
      }
    }
    .toc__title {
      font-weight: 700;
      margin: 0 0 0.6rem;
    }
    .print {
      margin-top: 1rem;
    }
    .doc {
      max-width: 760px;
      line-height: 1.65;
      section {
        margin-bottom: 3rem;
        scroll-margin-top: 6rem;
      }
      h2 {
        text-transform: none;
        margin: 0.2rem 0 1rem;
      }
      h3 {
        margin: 2rem 0 0.8rem;
        font-size: 1.15rem;
        scroll-margin-top: 6rem;
      }
      h4 {
        margin: 1.2rem 0 0.5rem;
        font-size: 1rem;
        font-style: italic;
        color: var(--color-muted);
      }
      .eyebrow {
        margin: 0;
      }
    }
    .art {
      margin: 0 0 0.9rem;
      scroll-margin-top: 6rem;
      p {
        margin: 0 0 0.4rem;
      }
    }
    .items {
      margin: 0 0 0.9rem;
      padding-left: 1.2rem;
      li {
        margin-bottom: 0.3rem;
      }
    }
    ul.items {
      list-style: none;
    }
    blockquote {
      margin: 0;
      padding: 1rem 1.2rem;
      border-left: 4px solid var(--color-primary, #f2c200);
      background: var(--color-bg-soft);
      border-radius: var(--radius-s);
      p {
        margin: 0 0 0.5rem;
      }
    }
    .alert {
      margin-bottom: 2rem;
    }
    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }
      .toc {
        position: static;
        max-height: none;
      }
    }
    @media print {
      .toc,
      .back {
        display: none;
      }
      .layout {
        display: block;
      }
    }
  `,
})
export class StatutesPage {
  protected readonly statutes = STATUTES;
  protected readonly regulation = REGULATION;
  protected readonly note = NOTE_1987;
  protected readonly dr = DR_EXTRACT;
  protected readonly assembly = LAST_ASSEMBLY;

  constructor() {
    inject(SeoService).set({
      title: 'Estatutos e Regulamento Interno',
      description:
        'Estatutos, publicação no Diário da República e Regulamento Interno do Serrado Futebol Clube, transcritos dos originais.',
      path: '/clube/estatutos',
    });
  }

  protected print() {
    window.print();
  }
}
