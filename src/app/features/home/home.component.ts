import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { EventCardComponent, MatchCardComponent, NewsCardComponent, SponsorCardComponent, SportCardComponent } from '../../shared/cards';
import { IconComponent } from '../../shared/icon.component';
import { SocialFeedComponent } from '../../shared/social-feed.component';

@Component({
  selector: 'sfc-home',
  imports: [RouterLink, DatePipe, NewsCardComponent, MatchCardComponent, EventCardComponent, SportCardComponent, SponsorCardComponent, IconComponent, SocialFeedComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly content = inject(ContentService);

  protected readonly matches = this.content.upcomingMatches(undefined, 3);
  protected readonly nextEvent = this.content.upcomingEvents()[0];
  protected readonly news = this.content.news().slice(0, 4);
  protected readonly sports = this.content.sports().filter((s) => s.featured);
  protected readonly agenda = this.content.agenda().slice(0, 6);
  protected readonly sponsors = this.content.sponsors();
  protected readonly years = new Date().getFullYear() - 1978;
  protected readonly sportName = (slug?: string) => (slug ? this.content.sport(slug)?.name : 'Clube');

  constructor() {
    inject(SeoService).set({
      title: 'Uma história. Uma família. Várias modalidades.',
      description:
        'Site oficial do Serrado Futebol Clube, fundado em 1978 na Caparica. Atletismo, futsal, rugby e formação. Notícias, agenda, eventos e área de sócio.',
      path: '/',
    });
  }
}
