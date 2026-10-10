import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { accountGuard, memberGuard, staffGuard } from './features/account/member.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent) },
  { path: 'clube', loadComponent: () => import('./features/club/club.component').then((m) => m.ClubComponent) },
  { path: 'clube/estatutos', loadComponent: () => import('./features/club/statutes.page').then((m) => m.StatutesPage) },
  { path: 'modalidades', loadComponent: () => import('./features/sports/sports-list.component').then((m) => m.SportsListComponent) },
  // A Escola de Desporto passou para dentro da página do Futsal
  { path: 'modalidades/escola-de-desporto', redirectTo: () => inject(Router).createUrlTree(['/modalidades/futsal'], { fragment: 'escola-de-desporto' }) },
  { path: 'modalidades/:slug', loadComponent: () => import('./features/sports/sport-detail.component').then((m) => m.SportDetailComponent) },
  { path: 'noticias', loadComponent: () => import('./features/news/news-list.component').then((m) => m.NewsListComponent) },
  { path: 'noticias/:slug', loadComponent: () => import('./features/news/news-detail.component').then((m) => m.NewsDetailComponent) },
  { path: 'agenda', loadComponent: () => import('./features/agenda/agenda.component').then((m) => m.AgendaComponent) },
  { path: 'resultados', loadComponent: () => import('./features/agenda/results.component').then((m) => m.ResultsComponent) },
  { path: 'eventos', loadComponent: () => import('./features/events/events-list.component').then((m) => m.EventsListComponent) },
  { path: 'eventos/:slug', loadComponent: () => import('./features/events/event-detail.component').then((m) => m.EventDetailComponent) },
  { path: 'socios', loadComponent: () => import('./features/membership/membership.component').then((m) => m.MembershipComponent) },
  { path: 'inscricao', loadComponent: () => import('./features/signup/athlete-signup.page').then((m) => m.AthleteSignupPage) },
  { path: 'pre-inscricao', loadComponent: () => import('./features/signup/interest.page').then((m) => m.InterestPage) },
  { path: 'socios/registo', loadComponent: () => import('./features/membership/register.component').then((m) => m.RegisterComponent) },
  { path: 'entrar/nova-password', loadComponent: () => import('./features/account/new-password.component').then((m) => m.NewPasswordComponent) },
  { path: 'entrar', loadComponent: () => import('./features/account/login.component').then((m) => m.LoginComponent) },
  // Endereço antigo da entrada de sócio → ponto de acesso único
  {
    path: 'area-socio/entrar',
    redirectTo: ({ queryParams }) => inject(Router).createUrlTree(['/entrar'], { queryParams: { ...queryParams, perfil: 'socio' } }),
  },
  {
    path: 'area-socio',
    canActivate: [memberGuard],
    loadComponent: () => import('./features/account/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'area-atletas',
    canActivate: [accountGuard],
    loadComponent: () => import('./features/athletes/athlete-area.component').then((m) => m.AthleteAreaComponent),
  },
  {
    path: 'admin',
    canActivate: [staffGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: 'paginas/:slug', loadComponent: () => import('./features/legal/cms-page.component').then((m) => m.CmsPageComponent) },
  { path: 'parceiros', loadComponent: () => import('./features/partners/partners.component').then((m) => m.PartnersComponent) },
  { path: 'comunidade', loadComponent: () => import('./features/community/community.component').then((m) => m.CommunityComponent) },
  { path: 'multimedia', loadComponent: () => import('./features/media/media.component').then((m) => m.MediaComponent) },
  { path: 'loja', loadComponent: () => import('./features/shop/shop.component').then((m) => m.ShopComponent) },
  { path: 'contactos', loadComponent: () => import('./features/contacts/contacts.component').then((m) => m.ContactsComponent) },
  { path: 'pesquisa', loadComponent: () => import('./features/search/search.component').then((m) => m.SearchComponent) },
  { path: 'privacidade', loadComponent: () => import('./features/legal/legal.component').then((m) => m.LegalComponent), data: { page: 'privacidade' } },
  { path: 'cookies', loadComponent: () => import('./features/legal/legal.component').then((m) => m.LegalComponent), data: { page: 'cookies' } },
  { path: '**', loadComponent: () => import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent) },
];
