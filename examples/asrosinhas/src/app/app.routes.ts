import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home.page').then((m) => m.HomePage) },
  { path: 'sobre', loadComponent: () => import('./pages/about.page').then((m) => m.AboutPage) },
  { path: 'eventos', loadComponent: () => import('./pages/events.page').then((m) => m.EventsPage) },
  { path: 'loja', loadComponent: () => import('./pages/shop.page').then((m) => m.ShopPage) },
  {
    path: 'loja/:slug',
    loadComponent: () => import('./pages/product.page').then((m) => m.ProductPage),
  },
  { path: 'ajudar', loadComponent: () => import('./pages/help.page').then((m) => m.HelpPage) },
  {
    path: 'ajudar/socia',
    loadComponent: () => import('./pages/member.page').then((m) => m.MemberPage),
  },
  {
    path: 'ajudar/donativo',
    loadComponent: () => import('./pages/donate.page').then((m) => m.DonatePage),
  },
  {
    path: 'contactos',
    loadComponent: () => import('./pages/contacts.page').then((m) => m.ContactsPage),
  },
  { path: '**', loadComponent: () => import('./pages/not-found.page').then((m) => m.NotFoundPage) },
];
