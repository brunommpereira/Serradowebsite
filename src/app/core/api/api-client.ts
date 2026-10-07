import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api.config';

/** Erro da API com a mensagem já pronta a mostrar ao utilizador. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Cliente do middleware (/api/v1): envia o cookie de sessão (withCredentials)
 * e o cabeçalho X-Requested-With exigido nas escritas (proteção CSRF).
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  // Opcional: no modo demonstração (e nos testes) não é preciso HttpClient
  private readonly httpClient = inject(HttpClient, { optional: true });
  readonly baseUrl = inject(API_BASE_URL);
  readonly enabled = !!this.baseUrl;

  private readonly headers = new HttpHeaders({ 'X-Requested-With': 'XMLHttpRequest' });

  private get http(): HttpClient {
    if (!this.httpClient) throw new Error('HttpClient não configurado (provideHttpClient)');
    return this.httpClient;
  }

  get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string | number>;
    return this.run(this.http.get<T>(this.baseUrl + path, { params: clean, withCredentials: true }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.run(this.http.post<T>(this.baseUrl + path, body, { withCredentials: true, headers: this.headers }));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.run(this.http.put<T>(this.baseUrl + path, body, { withCredentials: true, headers: this.headers }));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.run(this.http.patch<T>(this.baseUrl + path, body, { withCredentials: true, headers: this.headers }));
  }

  delete<T>(path: string): Promise<T> {
    return this.run(this.http.delete<T>(this.baseUrl + path, { withCredentials: true, headers: this.headers }));
  }

  private async run<T>(req: ReturnType<HttpClient['get']>): Promise<T> {
    try {
      return (await firstValueFrom(req)) as T;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        const body = e.error as { error?: string; message?: string } | null;
        throw new ApiError(e.status, body?.error ?? 'http', body?.message ?? (e.status === 0 ? 'Sem ligação ao servidor' : 'Erro inesperado'));
      }
      throw e;
    }
  }
}
