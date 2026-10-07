import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Athlete,
  CLUB_DOWNLOADS,
  DEMO_ASSESSMENTS,
  DEMO_ATHLETES,
  DEMO_METRICS,
  DEMO_RECEIPTS,
  DEMO_SESSIONS,
  newAthleteDocuments,
  Rsvp,
  Session,
} from '../data/athletes-data';
import { SportSlug } from '../models';
import { nowIso } from './content.service';

const STORAGE_KEY = 'sfc.athletes.v1';
export const MAX_CO_GUARDIANS = 2;

interface PersistedState {
  athletes: Athlete[];
  sessions: Session[];
}

/**
 * Área de Atletas (encarregados de educação) — MODO DEMONSTRAÇÃO.
 *
 * Estado em memória, guardado no localStorage do browser para a demo
 * sobreviver a um recarregamento. Na fase 4/5 cada método passa a chamar a
 * API (endpoints indicados ao lado) e o estado deixa de ser local.
 */
@Injectable({ providedIn: 'root' })
export class AthleteAreaService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal<PersistedState>(this.restore());

  readonly athletes = computed(() => this.state().athletes);
  readonly downloads = CLUB_DOWNLOADS;

  /** GET /api/athletes/{id}/sessions?from=hoje */
  upcoming(athleteId: string): Session[] {
    const now = nowIso();
    return this.state()
      .sessions.filter((s) => s.athleteId === athleteId && s.status === 'Agendado' && s.date >= now)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** GET /api/athletes/{id}/sessions?until=hoje */
  history(athleteId: string): Session[] {
    const now = nowIso();
    return this.state()
      .sessions.filter((s) => s.athleteId === athleteId && (s.status !== 'Agendado' || s.date < now))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /** PUT /api/sessions/{id}/rsvp */
  setRsvp(sessionId: string, rsvp: Rsvp) {
    this.update((st) => ({
      ...st,
      sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, rsvp } : s)),
    }));
  }

  /** Indicadores de assiduidade num intervalo de datas (AAAA-MM-DD, inclusivo). */
  stats(athleteId: string, from: string, to: string) {
    const done = this.history(athleteId).filter((s) => s.status === 'Terminado' && s.date.slice(0, 10) >= from && s.date.slice(0, 10) <= to);
    const attended = done.filter((s) => s.attended);
    return {
      sessions: done.length,
      attended: attended.length,
      absences: done.length - attended.length,
      minutes: attended.reduce((acc, s) => acc + s.minutes, 0),
      list: done,
    };
  }

  metrics(athleteId: string) {
    return DEMO_METRICS[athleteId] ?? [];
  }

  assessments(athleteId: string) {
    return DEMO_ASSESSMENTS[athleteId] ?? [];
  }

  /** GET /api/guardians/me/receipts */
  receipts(athleteId: string) {
    return DEMO_RECEIPTS.filter((r) => r.athleteId === athleteId).sort((a, b) => b.date.localeCompare(a.date));
  }

  /** POST /api/athletes/{id}/documents/{docId} — o ficheiro fica "Em análise" até validação do clube. */
  uploadDocument(athleteId: string, docId: string) {
    this.patchAthlete(athleteId, (a) => ({
      ...a,
      documents: a.documents.map((d) => (d.id === docId ? { ...d, status: 'Em análise', note: undefined } : d)),
    }));
  }

  /** POST /api/athletes/{id}/co-guardians — convite pessoal, uso único, expira em 7 dias. */
  inviteCoGuardian(athleteId: string, email: string): 'ok' | 'limite' | 'duplicado' {
    const athlete = this.athletes().find((a) => a.id === athleteId);
    if (!athlete) return 'limite';
    const normalized = email.trim().toLowerCase();
    if (athlete.coGuardians.includes(normalized)) return 'duplicado';
    if (athlete.coGuardians.length >= MAX_CO_GUARDIANS) return 'limite';
    this.patchAthlete(athleteId, (a) => ({ ...a, coGuardians: [...a.coGuardians, normalized] }));
    return 'ok';
  }

  revokeCoGuardian(athleteId: string, email: string) {
    this.patchAthlete(athleteId, (a) => ({ ...a, coGuardians: a.coGuardians.filter((e) => e !== email) }));
  }

  /** POST /api/guardians/me/athletes */
  addAthlete(data: { name: string; birthDate: string; sportSlug: SportSlug; level: string }): Athlete {
    const athlete: Athlete = {
      id: `atl-${Date.now()}`,
      ...data,
      coGuardians: [],
      documents: newAthleteDocuments(),
    };
    this.update((st) => ({ ...st, athletes: [...st.athletes, athlete] }));
    return athlete;
  }

  /** PUT /api/athletes/{id} */
  updateAthlete(athleteId: string, data: { name: string; birthDate: string }) {
    this.patchAthlete(athleteId, (a) => ({ ...a, ...data }));
  }

  /** Repõe os dados de demonstração. */
  reset() {
    this.state.set(initialState());
    this.persist();
  }

  private patchAthlete(id: string, fn: (a: Athlete) => Athlete) {
    this.update((st) => ({ ...st, athletes: st.athletes.map((a) => (a.id === id ? fn(a) : a)) }));
  }

  private update(fn: (st: PersistedState) => PersistedState) {
    this.state.update(fn);
    this.persist();
  }

  private restore(): PersistedState {
    if (this.isBrowser) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as PersistedState;
      } catch {
        /* armazenamento indisponível ou corrompido: usa os dados iniciais */
      }
    }
    return initialState();
  }

  private persist() {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      /* sem armazenamento: o estado fica só em memória */
    }
  }
}

function initialState(): PersistedState {
  return { athletes: structuredClone(DEMO_ATHLETES), sessions: structuredClone(DEMO_SESSIONS) };
}

/** Idade em anos completos numa data de referência. */
export function ageOn(birthDate: string, ref = new Date()): number {
  const b = new Date(birthDate);
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age;
}
