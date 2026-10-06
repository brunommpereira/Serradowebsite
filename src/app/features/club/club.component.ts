import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'sfc-club',
  imports: [RouterLink, PageHeroComponent, IconComponent],
  templateUrl: './club.component.html',
  styleUrl: './club.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubComponent {
  private readonly content = inject(ContentService);
  protected readonly club = this.content.club;
  protected readonly boards = this.content.boards();
  protected readonly documents = this.content.documents();
  protected readonly docCategories = [...new Set(this.documents.map((d) => d.category))];
  protected readonly docFilter = signal<string | null>(null);
  protected readonly filteredDocs = computed(() => this.documents.filter((d) => !this.docFilter() || d.category === this.docFilter()));

  protected readonly timeline = [
    { year: '1978', title: 'Fundação do clube', text: 'A 29 de abril de 1978 nasce o Serrado Futebol Clube, no Bairro do Serrado, Caparica.' },
    { year: '', title: 'Primeiras atividades', text: 'Os primeiros jogos, torneios e convívios juntam o bairro à volta do clube.' },
    { year: '', title: 'Crescimento', text: 'Mais sócios, mais atletas e uma sede que se torna ponto de encontro da comunidade.' },
    { year: '', title: 'Novas modalidades', text: 'O clube abre-se a novas modalidades: atletismo, futsal e rugby.' },
    { year: '', title: 'Formação', text: 'A aposta na formação traz centenas de crianças e jovens ao desporto.' },
    { year: '', title: 'Projetos comunitários', text: 'Caminhadas solidárias, voluntariado e o projeto Descobrir Património.' },
    { year: '2026', title: 'Clube multidesportivo', text: 'Um clube moderno, digital e aberto a todos, fiel às suas raízes.' },
  ];

  protected readonly values = [
    { icon: 'users', title: 'Comunidade', text: 'O clube é de quem o vive: atletas, famílias, sócios e vizinhos.' },
    { icon: 'star', title: 'Formação', text: 'Formar atletas e, acima de tudo, formar pessoas.' },
    { icon: 'trophy', title: 'Competição', text: 'Ambição de ganhar, com respeito pelos adversários.' },
    { icon: 'heart', title: 'Inclusão', text: 'Portas abertas a todos, sem exceção.' },
    { icon: 'shield', title: 'Transparência', text: 'Contas claras e gestão aberta aos sócios.' },
    { icon: 'check', title: 'Profissionalismo', text: 'Organização, rigor e treinadores qualificados.' },
  ];

  protected readonly facilities = [
    { name: 'Centro de Treinos do Serrado', text: 'Campo para treinos e jogos de rugby e atletismo, com balneários e bancada.' },
    { name: 'Pavilhão', text: 'Casa do futsal e da Escola de Desporto.' },
    { name: 'Sede social', text: 'Secretaria, sala de reuniões, bar e espaço de convívio dos sócios.' },
  ];

  constructor() {
    inject(SeoService).set({
      title: 'O Clube',
      description: 'A história, missão, valores, órgãos sociais, documentos e instalações do Serrado Futebol Clube, fundado em 1978.',
      path: '/clube',
    });
  }
}
