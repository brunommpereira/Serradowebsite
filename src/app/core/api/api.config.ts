import { InjectionToken } from '@angular/core';

/**
 * Endereço da API pública (middleware), ex.: 'https://api.serradofc.pt/api/v1'.
 *
 * Vazio = MODO DEMONSTRAÇÃO: o site usa os dados de `core/data` e o
 * localStorage do browser (é o que corre hoje no GitHub Pages).
 * Preenchido = o front fala com o middleware (ver docs/ARCHITECTURE.md).
 */
export const API_BASE_URL_VALUE = '';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', { providedIn: 'root', factory: () => API_BASE_URL_VALUE });
