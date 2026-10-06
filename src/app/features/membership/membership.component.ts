import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'sfc-membership',
  imports: [RouterLink, CurrencyPipe, PageHeroComponent, IconComponent],
  templateUrl: './membership.component.html',
  styleUrl: './membership.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembershipComponent {
  private readonly content = inject(ContentService);
  protected readonly categories = this.content.membershipCategories();
  protected readonly benefits = this.content.membershipBenefits();
  protected readonly faq = this.content.membershipFaq();
  protected readonly benefitIcons = ['card', 'ball', 'euro', 'users', 'calendar', 'heart'];

  protected readonly steps = [
    { title: 'Escolhe a categoria', text: 'Sénior, Juvenil, Criança ou Familiar.' },
    { title: 'Preenche o registo', text: 'Dados pessoais e consentimentos RGPD.' },
    { title: 'Paga a primeira quota', text: 'MB WAY, Multibanco, cartão ou débito direto.' },
    { title: 'Recebe o teu número', text: 'Número de sócio, cartão digital e recibo no email.' },
  ];

  constructor() {
    inject(SeoService).set({
      title: 'Ser Sócio',
      description: 'Torna-te sócio do Serrado FC: categorias, quotas, benefícios, cartão digital e perguntas frequentes.',
      path: '/socios',
    });
  }
}
