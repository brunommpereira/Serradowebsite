import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon.component';
import { ContentService } from '../../core/services/content.service';
import { MemberAuthService } from '../../core/services/member-auth.service';
import { MAIN_NAV } from '../nav';

@Component({
  selector: 'sfc-header',
  imports: [RouterLink, RouterLinkActive, IconComponent, DatePipe, FormsModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeAll()' },
})
export class HeaderComponent {
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  protected readonly auth = inject(MemberAuthService);

  protected readonly nav = MAIN_NAV;
  protected readonly club = this.content.club;
  protected readonly nextMatch = computed(() => this.content.upcomingMatches(undefined, 1)[0]);
  protected readonly sportName = (slug: string) => this.content.sport(slug)?.name ?? '';

  protected readonly openMenu = signal<string | null>(null);
  protected readonly mobileOpen = signal(false);
  protected readonly mobileGroup = signal<string | null>(null);
  protected readonly searchOpen = signal(false);
  protected query = '';

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => this.closeAll());
  }

  toggleMenu(label: string) {
    this.openMenu.update((cur) => (cur === label ? null : label));
  }

  onFocusOut(event: FocusEvent, label: string) {
    const next = event.relatedTarget as Node | null;
    const li = event.currentTarget as HTMLElement;
    if (!next || !li.contains(next)) {
      if (this.openMenu() === label) this.openMenu.set(null);
    }
  }

  toggleMobile() {
    this.mobileOpen.update((v) => !v);
    this.searchOpen.set(false);
  }

  toggleSearch() {
    this.searchOpen.update((v) => !v);
    this.mobileOpen.set(false);
    if (this.searchOpen()) setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  submitSearch() {
    const q = this.query.trim();
    if (!q) return;
    this.router.navigate(['/pesquisa'], { queryParams: { q } });
    this.query = '';
  }

  closeAll() {
    this.openMenu.set(null);
    this.mobileOpen.set(false);
    this.searchOpen.set(false);
  }
}
