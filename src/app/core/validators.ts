import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Valida um NIF português (9 dígitos + dígito de controlo). */
export function nifValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').replace(/\s/g, '');
    if (!value) return null;
    if (!isValidNif(value)) return { nif: true };
    return null;
  };
}

export function isValidNif(nif: string): boolean {
  if (!/^[1235689]\d{8}$/.test(nif) && !/^(45|70|71|72|74|75|77|79|90|91|98|99)\d{7}$/.test(nif)) return false;
  const digits = nif.split('').map(Number);
  const sum = digits.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  return check === digits[8];
}

export const POSTAL_CODE_PATTERN = /^\d{4}-\d{3}$/;
export const PHONE_PATTERN = /^(\+?\d{3}\s?)?\d{3}\s?\d{3}\s?\d{3}$/;
