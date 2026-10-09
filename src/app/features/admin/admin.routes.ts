import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import { staffGuard } from '../account/member.guard';
import { AdminSource } from './data/admin-source';
import { DemoAdminSource } from './data/demo-admin-source';
import { HttpAdminSource } from './data/http-admin-source';
import { AdminShellComponent } from './admin-shell.component';
import { unsavedChangesGuard } from './pages/unsaved.guard';

/** Backoffice /admin — cada secção exige uma das permissões indicadas em data.permissions. */
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
        data: { permissions: ['cms.edit'] },
        loadComponent: () => import('./pages/cms-list.page').then((m) => m.CmsListPage),
      },
      {
        path: 'conteudos/:type/:id',
        canActivate: [staffGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permissions: ['cms.edit'] },
        loadComponent: () => import('./pages/cms-editor.page').then((m) => m.CmsEditorPage),
      },
      {
        path: 'imagens',
        title: 'Imagens',
        canActivate: [staffGuard],
        data: { permissions: ['cms.edit'] },
        loadComponent: () => import('./pages/media.page').then((m) => m.MediaPage),
      },
      {
        path: 'atletas',
        canActivate: [staffGuard],
        data: { permissions: ['athletes.view', 'athletes.manage'] },
        loadComponent: () => import('./pages/athletes.page').then((m) => m.AthletesPage),
      },
      {
        path: 'socios',
        title: 'Sócios',
        canActivate: [staffGuard],
        data: { permissions: ['members.view'] },
        loadComponent: () => import('./pages/members.page').then((m) => m.MembersPage),
      },
      {
        path: 'importar',
        title: 'Importar sócios e atletas',
        canActivate: [staffGuard],
        data: { permissions: ['members.manage', 'athletes.manage'] },
        loadComponent: () => import('./pages/registry-import.page').then((m) => m.RegistryImportPage),
      },
      {
        path: 'validacoes',
        canActivate: [staffGuard],
        data: { permissions: ['athletes.manage'] },
        loadComponent: () => import('./pages/reviews.page').then((m) => m.ReviewsPage),
      },
      {
        path: 'resultados',
        canActivate: [staffGuard],
        data: { permissions: ['results.import'] },
        loadComponent: () => import('./pages/results-import.page').then((m) => m.ResultsImportPage),
      },
      {
        path: 'pagamentos',
        canActivate: [staffGuard],
        data: { permissions: ['payments.view'] },
        loadComponent: () => import('./pages/payments.page').then((m) => m.PaymentsPage),
      },
      { path: 'utilizadores', canActivate: [staffGuard], data: { permissions: ['users.manage'] }, loadComponent: () => import('./pages/users.page').then((m) => m.UsersPage) },
      {
        path: 'papeis',
        title: 'Papéis e permissões',
        canActivate: [staffGuard],
        data: { permissions: ['users.manage'] },
        loadComponent: () => import('./pages/roles.page').then((m) => m.RolesPage),
      },
      { path: 'auditoria', loadComponent: () => import('./pages/audit.page').then((m) => m.AuditPage) },
    ],
  },
];
