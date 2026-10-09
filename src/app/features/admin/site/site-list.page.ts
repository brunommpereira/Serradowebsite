import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BLOCKS } from '../../../core/site/site-blocks';
import { BlockDef } from '../../../core/site/site.models';
import { IconComponent } from '../../../shared/icon.component';

/** Conteúdos do site com estrutura própria, agrupados como no site. */
@Component({
  selector: 'sfc-admin-site-list',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Conteúdos do site</h1>
        <p>
          Contactos, clube, modalidades, jogos, loja e outras partes fixas do site. Notícias,
          eventos, páginas e parceiros editam-se em
          <a routerLink="/admin/conteudos/news">Conteúdos (CMS)</a>.
        </p>
      </div>
    </div>
    @for (g of groups; track g.name) {
      <section class="group">
        <h2>{{ g.name }}</h2>
        <ul class="cards">
          @for (b of g.blocks; track b.key) {
            <li>
              <a class="card-link adm-panel" [routerLink]="['/admin/site', b.key]">
                <span class="ic"><sfc-icon [name]="b.icon" size="22" /></span>
                <span>
                  <strong>{{ b.label }}</strong>
                  <span class="caption">{{ b.description }}</span>
                </span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    .group {
      margin-bottom: 1.4rem;
      h2 {
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-muted);
        margin: 0 0 0.6rem;
      }
    }
    .cards {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.8rem;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
    }
    .card-link {
      display: flex;
      gap: 0.8rem;
      align-items: flex-start;
      height: 100%;
      color: var(--color-text);
      text-decoration: none;
      transition: box-shadow 0.15s;
      &:hover {
        box-shadow: 0 6px 18px -10px rgba(0, 30, 70, 0.4);
      }
      strong {
        display: block;
        color: var(--sfc-blue-900);
      }
      .caption {
        display: block;
        margin-top: 0.2rem;
      }
    }
    .ic {
      flex: none;
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--color-bg-soft);
      color: var(--sfc-blue);
    }
  `,
})
export class SiteListPage {
  protected readonly groups = BLOCKS.reduce<{ name: string; blocks: BlockDef[] }[]>((acc, b) => {
    const g = acc.find((x) => x.name === b.group);
    if (g) g.blocks.push(b);
    else acc.push({ name: b.group, blocks: [b] });
    return acc;
  }, []);
}
