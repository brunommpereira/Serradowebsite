import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Athlete,
  AthleteDetails,
  CLUB_DOWNLOADS,
  CURRENT_SEASON,
  IdentityChanges,
  CompetitionResult,
  DEMO_ASSESSMENTS,
  DEMO_ATHLETES,
  DEMO_METRICS,
  DEMO_RECEIPTS,
  DEMO_RESULTS,
  DEMO_SESSIONS,
  emptyDetails,
  newAthleteDocuments,
  Rsvp,
  Session,
} from '../data/athletes-data';
import { SportSlug } from '../models';
import { nowIso } from './content.service';
import { AuthService } from './auth.service';

const STORAGE_KEY = 'sfc.athletes.v3';
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
  private readonly auth = inject(AuthService);
  private readonly state = signal<PersistedState>(this.restore());
  private readonly accountId = computed(() => this.auth.account()?.id ?? '');

  /** Atletas que a conta pode ver: os seus educandos e/ou o próprio registo de atleta. */
  readonly athletes = computed(() => {
    const id = this.accountId();
    return id ? this.state().athletes.filter((a) => a.guardians.includes(id) || a.selfAccount === id) : [];
  });

  /**
   * Perfil da conta: «encarregado» quando tem educandos (pode ser também atleta);
   * «atleta» quando só tem o seu próprio registo. GET /api/me/profile
   */
  readonly role = computed<'encarregado' | 'atleta'>(() => {
    const id = this.accountId();
    const list = this.athletes();
    return list.length && list.every((a) => a.selfAccount === id) ? 'atleta' : 'encarregado';
  });

  readonly downloads = CLUB_DOWNLOADS;

  /** O atleta é o próprio titular da conta? */
  isSelf(athleteId: string) {
    return this.athletes().some((a) => a.id === athleteId && a.selfAccount === this.accountId());
  }

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

  /** Resultados no Troféu Almada em Atletismo, do mais recente para o mais antigo. GET /api/athletes/{id}/results */
  results(athleteId: string): CompetitionResult[] {
    return DEMO_RESULTS.filter((r) => r.athleteId === athleteId).sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Evolução por prova entre épocas (só provas disputadas em 2+ épocas).
   * O tempo só é comparável com a mesma distância; caso contrário compara-se o ritmo.
   */
  raceEvolution(athleteId: string): RaceEvolution[] {
    const byRace = new Map<string, CompetitionResult[]>();
    for (const r of this.results(athleteId)) byRace.set(r.raceBase, [...(byRace.get(r.raceBase) ?? []), r]);
    const out: RaceEvolution[] = [];
    for (const [race, list] of byRace) {
      if (new Set(list.map((r) => r.season)).size < 2) continue;
      const editions = [...list].sort((a, b) => a.date.localeCompare(b.date));
      out.push({
        race,
        editions: editions.map((r, i) => {
          const prev = editions[i - 1];
          const seconds = timeToSeconds(r.time);
          const pace = paceSecPerKm(seconds, r.distanceM);
          if (!prev) return { result: r, seconds, pace, sameDistance: null, categoryChanged: false, delta: null };
          const sameDistance = prev.distanceM === r.distanceM;
          const prevPace = paceSecPerKm(timeToSeconds(prev.time), prev.distanceM);
          const delta = sameDistance ? seconds - timeToSeconds(prev.time) : pace !== null && prevPace !== null ? pace - prevPace : null;
          return { result: r, seconds, pace, sameDistance, categoryChanged: prev.category !== r.category, delta };
        }),
      });
    }
    return out.sort((a, b) => b.editions.length - a.editions.length || a.race.localeCompare(b.race));
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
      guardians: [this.accountId()],
      details: emptyDetails(),
      documents: newAthleteDocuments(),
    };
    this.update((st) => ({ ...st, athletes: [...st.athletes, athlete] }));
    return athlete;
  }

  /** Dados confirmados para a época em curso? */
  isConfirmed(a: Athlete): boolean {
    return !!a.confirmedAt && a.confirmedAt >= CURRENT_SEASON.start;
  }

  /** Campos em falta para poder confirmar os dados da época. */
  missingFields(a: Athlete): string[] {
    const d = a.details;
    const minor = ageOn(a.birthDate) < 18;
    const required: [boolean, string][] = [
      [!!d.gender, 'Género'],
      [!!d.idNumber, 'N.º CC'],
      [!!d.taxNumber, 'NIF'],
      [!!d.email, 'Email'],
      [!!d.phone, 'Telemóvel'],
      [!!d.address && !!d.postalCode && !!d.city, 'Morada'],
      [!!d.shirtSize, 'Tamanho da t-shirt'],
      [!!d.emergencyName && !!d.emergencyPhone, 'Contacto de emergência'],
      [d.consentRgpd, minor ? 'Autorização RGPD do encarregado' : 'Consentimento RGPD'],
    ];
    return required.filter(([ok]) => !ok).map(([, label]) => label);
  }

  /** «Confirmo que os dados estão corretos» — PUT /api/athletes/{id}/confirmation */
  confirmData(athleteId: string): boolean {
    const a = this.athletes().find((x) => x.id === athleteId);
    if (!a || this.missingFields(a).length) return false;
    this.patchAthlete(athleteId, (x) => ({ ...x, confirmedAt: nowIso().slice(0, 10) }));
    return true;
  }

  /**
   * Guarda a ficha (e confirma-a). Alterações a dados de identificação ficam
   * marcadas para validação da secretaria. PUT /api/athletes/{id}
   * @returns campos de identificação alterados (vazio se só mudaram contactos)
   */
  updateAthlete(athleteId: string, data: { name: string; birthDate: string; details: AthleteDetails }): string[] {
    const a = this.athletes().find((x) => x.id === athleteId);
    if (!a) return [];
    const identity: [string, unknown, unknown][] = [
      ['Nome', a.name, data.name],
      ['Data de nascimento', a.birthDate, data.birthDate],
      ['Género', a.details.gender, data.details.gender],
      ['N.º CC', a.details.idNumber, data.details.idNumber],
      ['NIF', a.details.taxNumber, data.details.taxNumber],
    ];
    const changed = identity.filter(([, before, after]) => before !== after).map(([label]) => label);
    const today = nowIso().slice(0, 10);
    const requested: IdentityChanges = {};
    if (data.name !== a.name) requested.name = data.name;
    if (data.birthDate !== a.birthDate) requested.birthDate = data.birthDate;
    if (data.details.gender !== a.details.gender) requested.gender = data.details.gender;
    if (data.details.idNumber !== a.details.idNumber) requested.idNumber = data.details.idNumber;
    if (data.details.taxNumber !== a.details.taxNumber) requested.taxNumber = data.details.taxNumber;
    this.patchAthlete(athleteId, (x) => ({
      ...x,
      // Contactos, emergência, equipamento e consentimentos: aplicados já.
      // Identificação: fica pendente até a secretaria validar (como no backend).
      details: { ...data.details, gender: x.details.gender, idNumber: x.details.idNumber, taxNumber: x.details.taxNumber },
      confirmedAt: today,
      pendingReview: changed.length
        ? {
            fields: [...new Set([...(x.pendingReview?.fields ?? []), ...changed])],
            requestedAt: today,
            changes: { ...(x.pendingReview?.changes ?? {}), ...requested },
          }
        : x.pendingReview,
    }));
    return changed;
  }

  // ---------------------------------------------------------------- backoffice (secretaria)

  /** Todos os atletas do clube (backoffice). GET /api/v1/admin/athletes */
  readonly allAthletes = computed(() => this.state().athletes);

  /** Aprova (aplica) ou rejeita o pedido de alteração de identificação. */
  resolveChange(athleteId: string, approve: boolean) {
    this.patchAthlete(athleteId, (a) => {
      const c = a.pendingReview?.changes ?? {};
      return {
        ...a,
        ...(approve ? { name: c.name ?? a.name, birthDate: c.birthDate ?? a.birthDate } : {}),
        details: approve
          ? { ...a.details, gender: c.gender ?? a.details.gender, idNumber: c.idNumber ?? a.details.idNumber, taxNumber: c.taxNumber ?? a.details.taxNumber }
          : a.details,
        pendingReview: undefined,
      };
    });
  }

  /** Valida um documento de inscrição (Aprovado / Rejeitado com motivo). */
  reviewDocument(athleteId: string, docId: string, approve: boolean, note?: string) {
    this.patchAthlete(athleteId, (a) => ({
      ...a,
      documents: a.documents.map((d) => (d.id === docId ? { ...d, status: approve ? 'Aprovado' : 'Rejeitado', note: approve ? undefined : note } : d)),
    }));
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

export interface RaceEvolution {
  race: string;
  editions: {
    result: CompetitionResult;
    seconds: number;
    /** segundos por km */
    pace: number | null;
    /** null na primeira edição */
    sameDistance: boolean | null;
    /** Mudou de escalão (nos jovens a distância aumenta e o ritmo não é diretamente comparável) */
    categoryChanged: boolean;
    /** vs edição anterior: segundos (mesma distância) ou s/km (distância diferente); negativo = mais rápido */
    delta: number | null;
  }[];
}

/** «38:15.02» ou «1:02:03.4» → segundos */
export function timeToSeconds(time: string): number {
  return time.split(':').reduce((acc, part) => acc * 60 + Number(part.replace(',', '.')), 0);
}

export function paceSecPerKm(seconds: number, distanceM: number | null): number | null {
  return distanceM ? seconds / (distanceM / 1000) : null;
}

/** 225.4 → «3:45» */
export function formatClock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

// ---------------------------------------------------------------- validações

/** NIF português: 9 dígitos com dígito de controlo (módulo 11). */
export function isValidNif(nif: string): boolean {
  if (!/^[1235689]\d{8}$/.test(nif)) return false;
  const sum = [...nif.slice(0, 8)].reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return Number(nif[8]) === (check >= 10 ? 0 : check);
}

/** CC/BI: 7 ou 8 dígitos do número de identificação civil. */
export const isValidIdNumber = (v: string) => /^\d{7,8}$/.test(v);
export const isValidPostalCode = (v: string) => /^\d{4}-\d{3}$/.test(v);
/** Telemóvel/telefone nacional (9 dígitos) ou internacional (+…). */
export const isValidPhone = (v: string) => /^(9\d{8}|2\d{8}|\+\d{8,15})$/.test(v.replace(/\s/g, ''));
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Idade em anos completos numa data de referência. */
export function ageOn(birthDate: string, ref = new Date()): number {
  const b = new Date(birthDate);
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age;
}
