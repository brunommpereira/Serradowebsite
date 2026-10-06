import { isValidNif, POSTAL_CODE_PATTERN } from './validators';

describe('validators', () => {
  it('aceita NIF válido e rejeita inválido', () => {
    expect(isValidNif('123456789')).toBe(true);
    expect(isValidNif('501523332')).toBe(true);
    expect(isValidNif('123456788')).toBe(false);
    expect(isValidNif('12345')).toBe(false);
  });

  it('valida código postal português', () => {
    expect(POSTAL_CODE_PATTERN.test('2825-095')).toBe(true);
    expect(POSTAL_CODE_PATTERN.test('2825095')).toBe(false);
  });
});
