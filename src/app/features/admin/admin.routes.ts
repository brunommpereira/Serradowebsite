import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import { staffGuard } from '../account/member.guard';
import { AdminSource } from './data/admin-source';
import { DemoAdminSource } from './data/demo-admin-source';
import { HttpAdminSource } from './data/http-admin-source';
import { AdminShellComponent } from './admin-shell.component';
import { unsavedChangesGuard } from './pages/unsaved.guard';

/** Backoffice /admin — cada secção exige os papéis indicados em data.roles. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    providers: [
      DemoAdminSource,
      HttpAdminSource,
      // Modo API → middleware; modo demonstração → dados locais
      { provide: AdminSource, useFactory: () => (inject(ApiClient).enabled ? inject(HttpAdminSource) : inject(DemoAdminSource)) },
    ],
    children: [
      { path: '', title: 'Backoffice', loadComponent: () => import('./pages/dashboard.page').then((m) => m.DashboardPage) },
      {
        path: 'conteudos/:type',
        canActivate: [staffGuard],
        data: { roles: ['editor'] },
        loadComponent: () => import('./pages/cms-list.page').then((m) => m.CmsListPage),
      },
      {
        path: 'conteudos/:type/:id',
        canActivate: [staffGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { roles: ['editor'] },
        loadComponent: () => import('./pages/cms-editor.page').then((m) => m.CmsEditorPage),
      },
      {
        path: 'imagens',
        title: 'Imagens',
        canActivate: [staffGuard],
        data: { roles: ['editor'] },
        loadComponent: () => import('./pages/media.page').then((m) => m.MediaPage),
      },
      {
        path: 'atletas',
        canActivate: [staffGuard],
        data: { roles: ['secretaria', 'treinador'] },
        loadComponent: () => import('./pages/athletes.page').then((m) => m.AthletesPage),
      },
      {
        path: 'validacoes',
        canActivate: [staffGuard],
        data: { roles: ['secretaria'] },
        loadComponent: () => import('./pages/reviews.page').then((m) => m.ReviewsPage),
      },
      {
        path: 'resultados',
        canActivate: [staffGuard],
        data: { roles: ['secretaria'] },
        loadComponent: () => import('./pages/results-import.page').then((m) => m.ResultsImportPage),
      },
      { path: 'utilizadores', canActivate: [staffGuard], data: { roles: ['admin'] }, loadComponent: () => import('./pages/users.page').then((m) => m.UsersPage) },
      { path: 'auditoria', loadComponent: () => import('./pages/audit.page').then((m) => m.AuditPage) },
    ],
  },
];
