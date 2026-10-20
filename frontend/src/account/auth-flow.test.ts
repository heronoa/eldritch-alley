import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import {
  canSubmit,
  confirmationProblem,
  EMPTY_FIELDS,
  formFailure,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  nextStep,
  passwordProblem,
  resetFailure,
  signInFailure,
  type AuthFields,
} from './auth-flow';

function fields(overrides: Partial<AuthFields> = {}): AuthFields {
  return { ...EMPTY_FIELDS, email: 'heron@example.com', password: 'password1234', ...overrides };
}

describe('the dialog steps', () => {
  it('opens on the sign-in tab from the closed state', () => {
    expect(nextStep('closed', 'open')).toBe('sign-in');
    expect(nextStep('closed', 'sign-up')).toBe('sign-up');
    expect(nextStep('closed', 'forgot')).toBe('forgot');
  });

  it('moves between the tabs and closes', () => {
    expect(nextStep('sign-in', 'sign-up')).toBe('sign-up');
    expect(nextStep('sign-up', 'forgot')).toBe('forgot');
    expect(nextStep('forgot', 'sign-in')).toBe('sign-in');
    expect(nextStep('sign-in', 'close')).toBe('closed');
  });

  it('answers a sent form with the mailbox step, and back returns to the first tab', () => {
    expect(nextStep('sign-up', 'sent')).toBe('check-mail');
    expect(nextStep('check-mail', 'back')).toBe('sign-in');
    expect(nextStep('check-mail', 'close')).toBe('closed');
  });

  it('leaves the step alone for an event it does not answer', () => {
    expect(nextStep('closed', 'sent')).toBe('closed');
    expect(nextStep('closed', 'back')).toBe('closed');
    expect(nextStep('check-mail', 'sent')).toBe('check-mail');
    expect(nextStep('sign-in', 'open')).toBe('sign-in');
  });
});

describe('whether a form may be sent', () => {
  it('needs both fields to sign in, with no length rule', () => {
    expect(canSubmit('sign-in', fields())).toBe(true);
    expect(canSubmit('sign-in', fields({ password: '' }))).toBe(false);
    expect(canSubmit('sign-in', fields({ email: '   ' }))).toBe(false);
    // An old password shorter than today's policy still signs in: the login route has no length rule.
    expect(canSubmit('sign-in', fields({ password: 'short' }))).toBe(true);
  });

  it('applies the platform policy to a new password', () => {
    expect(canSubmit('sign-up', fields({ password: 'short' }))).toBe(false);
    expect(canSubmit('sign-up', fields())).toBe(true);
  });

  it('needs only an address to send a recovery message', () => {
    expect(canSubmit('forgot', fields({ password: '' }))).toBe(true);
    expect(canSubmit('forgot', fields({ email: '' }))).toBe(false);
  });

  it('sends nothing from a closed dialog or from the mailbox step', () => {
    expect(canSubmit('closed', fields())).toBe(false);
    expect(canSubmit('check-mail', fields())).toBe(false);
  });
});

describe('the password policy', () => {
  it('holds the platform bounds', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('too-short');
    expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toBe('too-long');
  });

  it('asks the reset page to confirm what it typed', () => {
    expect(confirmationProblem('password1234', 'password1234')).toBeNull();
    expect(confirmationProblem('password1234', 'password1235')).toBe('mismatch');
  });
});

describe('naming a failure', () => {
  it('tells the three sign-in refusals apart and names a silent platform', () => {
    const refused = (code: string, status = 400) => new ApiError('refused', status, code, 'no');

    expect(signInFailure(refused('invalid_credentials', 401))).toBe('invalid-credentials');
    expect(signInFailure(refused('email_not_verified', 403))).toBe('email-not-verified');
    expect(signInFailure(refused('too_many_attempts', 429))).toBe('too-many-attempts');
    expect(signInFailure(new ApiError('offline', null, null, 'down'))).toBe('offline');
    expect(signInFailure(new ApiError('unknown', 500, null, 'down'))).toBe('unknown');
    expect(signInFailure(new Error('boom'))).toBe('unknown');
  });

  it('names the form refusals the platform sends', () => {
    expect(formFailure(new ApiError('refused', 400, 'invalid_password', 'short'))).toBe('invalid-password');
    expect(formFailure(new ApiError('refused', 400, 'invalid_body', 'email'))).toBe('invalid-body');
    expect(formFailure(new ApiError('offline', null, null, 'down'))).toBe('offline');
    expect(formFailure(new ApiError('unknown', 500, null, 'down'))).toBe('unknown');
  });

  it('gives a spent link a line of its own on the reset page', () => {
    expect(resetFailure(new ApiError('refused', 400, 'invalid_token', 'spent'))).toBe('invalid-token');
    expect(resetFailure(new ApiError('refused', 400, 'invalid_password', 'short'))).toBe('invalid-password');
    expect(resetFailure(new ApiError('offline', null, null, 'down'))).toBe('offline');
  });
});
