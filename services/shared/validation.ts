/** Validações de negócio partilhadas (as mesmas regras do front). */

/** NIF português: 9 dígitos com dígito de controlo (módulo 11). */
export function isValidNif(nif: string): boolean {
  if (!/^[1235689]\d{8}$/.test(nif)) return false;
  const sum = [...nif.slice(0, 8)].reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return Number(nif[8]) === (check >= 10 ? 0 : check);
}

export const isValidIdNumber = (v: string) => /^\d{7,8}$/.test(v);
export const isValidPostalCode = (v: string) => /^\d{4}-\d{3}$/.test(v);
export const isValidPhone = (v: string) => /^(9\d{8}|2\d{8}|\+\d{8,15})$/.test(v.replace(/\s/g, ''));

export function ageOn(birthDate: string, ref = new Date()): number {
  const b = new Date(birthDate);
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age;
}

/** Época desportiva em curso (começa a 1 de setembro). */
export function currentSeason(ref = new Date()) {
  const y = ref.getMonth() >= 8 ? ref.getFullYear() : ref.getFullYear() - 1;
  return { label: `${y}/${String(y + 1).slice(2)}`, start: `${y}-09-01` };
}
