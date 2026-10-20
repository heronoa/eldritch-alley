import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLocale, setLocale, type Locale } from '../i18n';
import { accountCopy, mailCopy } from './copy';

const LOCALES = ['pt-BR', 'en-US'] as const;

function copyIn(locale: Locale) {
  setLocale(locale);
  return accountCopy();
}

describe('the account copy', () => {
  let previous: Locale;
  beforeEach(() => {
    previous = getLocale();
  });
  afterEach(() => setLocale(previous));

  it('has a non-empty line for every string of the dialog and the panels, in either language', () => {
    for (const locale of LOCALES) {
      const copy = copyIn(locale);

      for (const [name, value] of Object.entries(copy)) {
        if (typeof value === 'function') continue;
        if (typeof value === 'object') {
          for (const [inner, line] of Object.entries(value)) {
            expect(typeof line, `${locale} ${name}.${inner}`).toBe('string');
            expect((line as string).trim(), `${locale} ${name}.${inner}`).not.toBe('');
          }
          continue;
        }
        expect(typeof value, `${locale} ${name}`).toBe('string');
        expect((value as string).trim(), `${locale} ${name}`).not.toBe('');
      }
    }
  });

  it('fills the level and the length of a match into their sentences', () => {
    const pt = copyIn('pt-BR');
    expect(pt.level(3)).toBe('nível 3');
    expect(pt.rounds(12)).toBe('12 rodadas');

    const en = copyIn('en-US');
    expect(en.level(3)).toBe('level 3');
    expect(en.rounds(12)).toBe('12 rounds');
  });

  it('names each failure a player can act on, in either language', () => {
    const pt = copyIn('pt-BR');
    expect(pt.problems['invalid-credentials']).toBe('Endereço ou senha incorretos');
    expect(pt.problems['email-not-verified']).toBe('Confirme o seu e-mail antes de entrar');
    expect(pt.problems['too-many-attempts']).toBe('Muitas tentativas. Espere alguns minutos.');
    expect(pt.problems.offline).toBe('O serviço não respondeu');

    const en = copyIn('en-US');
    expect(en.problems['invalid-credentials']).toBe('Wrong address or password');
    expect(en.problems.offline).toBe('The service did not answer');
  });

  it('names every provider the platform can answer, with the realm reading as SSO', () => {
    expect(copyIn('pt-BR').providerNames.keycloak).toBe('SSO');
    expect(copyIn('en-US').providerNames.keycloak).toBe('SSO');
  });

  it('carries the security card and a sentence for every way a deletion can be refused', () => {
    for (const locale of LOCALES) {
      const copy = copyIn(locale);

      expect(copy.securityLabel.trim()).not.toBe('');
      expect(copy.securityDelete.trim()).not.toBe('');
      expect(copy.deleteWarning.trim()).not.toBe('');
      expect(Object.keys(copy.deletionProblems).sort()).toEqual([
        'confirmation',
        'offline',
        'password',
        'signed-out',
        'throttled',
        'unknown',
      ]);
      for (const [reason, line] of Object.entries(copy.deletionProblems)) {
        expect(line.trim(), `${locale} ${reason}`).not.toBe('');
      }
    }
  });

  it('names the maps the history can list, and leaves an unknown one to the panel', () => {
    const pt = copyIn('pt-BR');
    expect(pt.mapNames).toEqual({
      street: 'Rua do Comércio e beco',
      park: 'Praça Municipal nº 3',
      roof: 'Edifício Central, cobertura',
    });
    expect(pt.mapNames['harbour']).toBeUndefined();
  });
});

describe('the mailed-link copy', () => {
  let previous: Locale;
  beforeEach(() => {
    previous = getLocale();
  });
  afterEach(() => setLocale(previous));

  it('has the words of both pages, in either language', () => {
    setLocale('pt-BR');
    const pt = mailCopy();
    expect(pt.verifyHeading).toBe('Confirmar o seu e-mail');
    expect(pt.resetAction).toBe('Guardar a senha');
    expect(pt.back).toBe('Voltar ao início');

    setLocale('en-US');
    const en = mailCopy();
    expect(en.verifyHeading).toBe('Confirm your email');
    expect(en.resetAction).toBe('Save the password');
    expect(en.back).toBe('Back to the start');
  });

  it('carries the two failure sentences the reset page can show', () => {
    setLocale('pt-BR');
    expect(mailCopy().problems['invalid-password']).toBe('A senha tem de ter entre 12 e 128 caracteres');
    expect(mailCopy().problems.mismatch).toBe('As duas senhas não conferem');
  });
});
