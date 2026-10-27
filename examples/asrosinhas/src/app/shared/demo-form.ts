import { signal } from '@angular/core';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Mensagens junto ao campo: dizem o que fazer, não só o que está mal. */
const MESSAGES: Record<string, Partial<Record<keyof ValidityState, string>>> = {
  nome: { valueMissing: 'Escreve o teu nome.' },
  email: {
    valueMissing: 'Escreve o teu email.',
    typeMismatch: 'Escreve o email no formato nome@exemplo.pt.',
  },
  morada: { valueMissing: 'Escreve a morada para onde enviamos.' },
  cp: {
    valueMissing: 'Escreve o código postal.',
    patternMismatch: 'Escreve o código postal no formato 2825-000.',
  },
  localidade: { valueMissing: 'Escreve a localidade.' },
  nif: { patternMismatch: 'O NIF tem 9 algarismos, sem espaços.' },
  sexo: { valueMissing: 'Escolhe uma opção.' },
  nascimento: { valueMissing: 'Indica a data de nascimento.' },
  telemovel: {
    valueMissing: 'Escreve o número de telemóvel.',
    patternMismatch: 'Escreve um telemóvel com 9 algarismos, por exemplo 912 345 678.',
  },
  tamanho: { valueMissing: 'Escolhe um tamanho para continuar.' },
  valor: {
    valueMissing: 'Escolhe um valor ou escreve outro.',
    rangeUnderflow: 'O valor mínimo é 1 €.',
  },
  mensagem: {
    valueMissing: 'Escreve a tua mensagem.',
    tooShort: 'Escreve pelo menos 10 caracteres.',
  },
  condicoes: { valueMissing: 'Confirma que leste as condições de entrega e de trocas.' },
};

/**
 * Formulários do protótipo: validação campo a campo (ao sair do campo e ao enviar), erros junto ao campo
 * e foco no primeiro erro. No projeto real o envio vai para a API, como no site do Serrado FC.
 */
export class DemoForm {
  readonly sent = signal(false);
  private form?: HTMLFormElement;

  submit(ev: Event): void {
    ev.preventDefault();
    const form = (this.form = ev.target as HTMLFormElement);
    const invalid = fields(form).filter((f) => !this.check(f));
    if (invalid.length) {
      focusField(invalid[0]);
      return;
    }
    this.sent.set(true);
  }

  /** Ao sair de um campo já preenchido (não incomoda quem só passa por ele) */
  blur(ev: FocusEvent): void {
    const f = ev.target as Field;
    if (isField(f) && (f.value || f.getAttribute('aria-invalid') === 'true')) this.check(f);
  }

  /** Enquanto escreve, o erro desaparece assim que o valor fica certo */
  input(ev: Event): void {
    const f = ev.target as Field;
    if (isField(f) && f.getAttribute('aria-invalid') === 'true') this.check(f);
  }

  /** Para valores escolhidos fora de um campo (ex.: tamanho nos botões) */
  recheck(name: string): void {
    const f = this.form?.elements.namedItem(name);
    if (f && isField(f as Field)) setTimeout(() => this.check(f as Field)); // depois de o Angular atualizar o campo
  }

  private check(f: Field): boolean {
    const ok = f.checkValidity();
    const id = `${f.name || f.id}-erro`;
    const host = f.type === 'checkbox' ? (f.closest('label') ?? f) : f;
    let msg = f.form?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (ok) {
      f.removeAttribute('aria-invalid');
      msg?.remove();
      return true;
    }
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'error';
      msg.id = id;
      host.insertAdjacentElement('afterend', msg);
    }
    msg.textContent = message(f);
    f.setAttribute('aria-invalid', 'true');
    const described = new Set(
      (f.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean),
    );
    described.add(id);
    f.setAttribute('aria-describedby', [...described].join(' '));
    return false;
  }
}

function fields(form: HTMLFormElement): Field[] {
  return [...form.elements].filter(
    (e): e is Field => isField(e as Field) && (e as Field).willValidate,
  );
}

function isField(e: Field): boolean {
  return (
    e instanceof HTMLInputElement ||
    e instanceof HTMLSelectElement ||
    e instanceof HTMLTextAreaElement
  );
}

function message(f: Field): string {
  const own = MESSAGES[f.name] ?? {};
  for (const k of Object.keys(own) as (keyof ValidityState)[]) if (f.validity[k]) return own[k]!;
  return f.validationMessage;
}

/** Campo escondido (ex.: tamanho) → foca a primeira opção do grupo */
function focusField(f: Field): void {
  const target = f.tabIndex < 0 ? f.closest('fieldset')?.querySelector<HTMLElement>('button') : f;
  (target ?? f).focus();
  (target ?? f).scrollIntoView({
    block: 'center',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

export const COUNTRIES = [
  'Portugal',
  'Espanha',
  'França',
  'Brasil',
  'Angola',
  'Moçambique',
  'Cabo Verde',
  'Outro',
];
