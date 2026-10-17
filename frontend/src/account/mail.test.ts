import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { getLocale, setLocale, type Locale } from '../i18n';
import { mailCopy } from './copy';
import {
  initialMailState,
  mailFailure,
  mailView,
  resetProblem,
  tokenFrom,
  type MailState,
} from './mail';

function refusal(code: string): ApiError {
  return new ApiError('refused', 400, code, code);
}

describe('the token of a mailed link', () => {
  it('is read from the address and never spent', () => {
    expect(tokenFrom('?token=abc')).toBe('abc');
    expect(tokenFrom('token=abc&x=1')).toBe('abc');
    expect(tokenFrom('?x=1&token=a%20b')).toBe('a b');
  });

  it('is absent when the address carries none, or an empty one', () => {
    expect(tokenFrom('')).toBeNull();
    expect(tokenFrom('?')).toBeNull();
    expect(tokenFrom('?token=')).toBeNull();
    expect(tokenFrom('?other=abc')).toBeNull();
  });

  it('leaves the page ready to ask only when there is one', () => {
    expect(initialMailState('?token=abc')).toEqual({ status: 'ready' });
    expect(initialMailState('')).toEqual({ status: 'missing-token' });
  });
});

describe('a new password before it is sent', () => {
  it('needs the length the platform asks for, then a matching confirmation', () => {
    expect(resetProblem('curta', 'curta')).toBe('too-short');
    expect(resetProblem('x'.repeat(129), 'x'.repeat(129))).toBe('too-long');
    expect(resetProblem('senha-bem-comprida', 'outra-bem-comprida')).toBe('mismatch');
    expect(resetProblem('senha-bem-comprida', 'senha-bem-comprida')).toBeNull();
  });
});

describe('a mailed page after a failure', () => {
  it('treats a refused token as the link being spent, on either page', () => {
    expect(mailFailure('verify', refusal('invalid_token'))).toEqual({ status: 'invalid-token' });
    expect(mailFailure('reset', refusal('invalid_token'))).toEqual({ status: 'invalid-token' });
  });

  it('keeps the form up with the sentence of what went wrong', () => {
    expect(mailFailure('verify', new ApiError('offline', null, null, 'x'))).toEqual({
      status: 'problem',
      problem: 'offline',
    });
    expect(mailFailure('reset', refusal('invalid_password'))).toEqual({
      status: 'problem',
      problem: 'invalid-password',
    });
  });
});

describe('the mailed page as a view', () => {
  let previous: Locale;
  beforeEach(() => {
    previous = getLocale();
    setLocale('pt-BR');
  });
  afterEach(() => setLocale(previous));

  function view(kind: 'verify' | 'reset', state: MailState) {
    return mailView(kind, state, mailCopy());
  }

  it('asks for a press on the verify page, with no field to fill', () => {
    const ready = view('verify', { status: 'ready' });

    expect(ready.heading).toBe('Confirmar o seu e-mail');
    expect(ready.action).toBe('Confirmar endereço');
    expect(ready.actionEnabled).toBe(true);
    expect(ready.passwordFields).toBe(false);
    expect(ready.problem).toBeNull();
  });

  it('asks for a new password and its confirmation on the reset page', () => {
    const ready = view('reset', { status: 'ready' });

    expect(ready.heading).toBe('Escolher nova senha');
    expect(ready.action).toBe('Guardar a senha');
    expect(ready.passwordFields).toBe(true);
    expect(ready.passwordHint).toBe('De 12 a 128 caracteres');
  });

  it('stops answering while a request is out, and says it is working', () => {
    const working = view('verify', { status: 'working' });

    expect(working.action).toBe('Confirmando…');
    expect(working.actionEnabled).toBe(false);
    expect(working.working).toBe(true);
  });

  it('thanks the player once it is done, with nothing left to press', () => {
    const verify = view('verify', { status: 'done' });
    expect(verify.heading).toBe('Endereço confirmado');
    expect(verify.action).toBeNull();
    expect(verify.passwordFields).toBe(false);

    const reset = view('reset', { status: 'done' });
    expect(reset.heading).toBe('Senha alterada');
    expect(reset.action).toBeNull();
  });

  it('says a link no longer works, and offers no button that can only fail again', () => {
    for (const state of [{ status: 'invalid-token' }, { status: 'missing-token' }] as const) {
      const invalid = view('verify', state);
      expect(invalid.action).toBeNull();
      expect(invalid.actionEnabled).toBe(false);
      expect(invalid.problem).toBeNull();
    }

    expect(view('verify', { status: 'invalid-token' }).heading).toBe('Este link já não vale');
    expect(view('verify', { status: 'missing-token' }).heading).toBe('Link incompleto');
  });

  it('keeps the form up with the sentence of the failure', () => {
    const mismatch = view('reset', { status: 'problem', problem: 'mismatch' });

    expect(mismatch.problem).toBe('As duas senhas não conferem');
    expect(mismatch.actionEnabled).toBe(true);
    expect(mismatch.passwordFields).toBe(true);
  });

  it('speaks the language the client is in', () => {
    setLocale('en-US');
    const ready = view('reset', { status: 'ready' });

    expect(ready.heading).toBe('Choose a new password');
    expect(ready.action).toBe('Save the password');
    expect(ready.back).toBe('Back to the start');
  });
});
