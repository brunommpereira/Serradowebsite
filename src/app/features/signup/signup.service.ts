import { inject, Injectable } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';

export type DocKind = 'socio' | 'atleta' | 'rgpd' | 'imagem';

export interface LegalDoc {
  version: number;
  title: string;
  body: string;
  sha256: string;
}

export interface SignupForm {
  documents: Partial<Record<DocKind, LegalDoc>>;
  ready: { member: boolean; athlete: boolean };
  categories: string[];
  sports: string[];
}

export interface SignupResult {
  id: string;
  evidenceSha256: string;
  memberNumber?: string;
  code?: string;
}

/** Registo online (público): documentos a aceitar e envio do formulário assinado. */
@Injectable({ providedIn: 'root' })
export class SignupService {
  private readonly api = inject(ApiClient);
  readonly enabled = this.api.enabled;

  form() {
    return this.api.get<SignupForm>('/registrations/form');
  }

  submit(kind: 'member' | 'athlete', body: Record<string, unknown>) {
    return this.api.post<SignupResult>(`/registrations/${kind}`, body);
  }
}

/** Parágrafos do texto simples (separados por linha em branco). */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
