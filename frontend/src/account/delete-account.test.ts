import { describe, expect, it } from 'vitest';
import type { Api } from '../api/client';
import { ApiError } from '../api/errors';
import {
  CONFIRMATION_WORD,
  confirmationAccepted,
  deleteAccount,
  type DeletionDraft,
} from './delete-account';

const WORD: DeletionDraft = { confirmation: CONFIRMATION_WORD, password: 'password1234' };

/** An API that records the deletion it was handed, and answers with the function the case gives it. */
function apiOver(answer: (input: { confirm: string; password?: string }) => Promise<void>): {
  api: Api;
  calls: { confirm: string; password?: string }[];
} {
  const calls: { confirm: string; password?: string }[] = [];
  const api: Api = {
    providers: async () => [],
    me: async () => null,
    gameTicket: async () => ({ ticket: '', expiresAt: '' }),
    logout: async () => {},
    deleteAccount: async (input) => {
      calls.push(input);
      await answer(input);
    },
    matches: async () => ({ matches: [], nextCursor: null }),
    register: async () => ({ status: 'sent' }),
    verify: async () => ({ verified: true }),
    resend: async () => ({ status: 'sent' }),
    login: async () => ({ user: { id: '', displayName: '', email: null, avatarUrl: null } }),
    forgot: async () => ({ status: 'sent' }),
    reset: async () => {},
  };
  return { api, calls };
}

describe('the confirmation rule', () => {
  it('takes the exact word, and answers nothing else', () => {
    expect(confirmationAccepted(WORD, true)).toBe(true);

    for (const confirmation of ['delete', 'Delete', 'DELETE ', '', 'DELETE\n']) {
      expect(confirmationAccepted({ ...WORD, confirmation }, false)).toBe(false);
    }
  });

  it('requires a password only when the account has one', () => {
    expect(confirmationAccepted({ confirmation: 'DELETE', password: '' }, true)).toBe(false);
    expect(confirmationAccepted({ confirmation: 'DELETE', password: 'x' }, true)).toBe(true);
    expect(confirmationAccepted({ confirmation: 'DELETE', password: '' }, false)).toBe(true);
  });
});

describe('deleting', () => {
  it('answers deleted when the platform took the request', async () => {
    const { api, calls } = apiOver(async () => {});

    await expect(deleteAccount(api, WORD, true)).resolves.toEqual({ status: 'deleted' });
    expect(calls).toEqual([{ confirm: 'DELETE', password: 'password1234' }]);
  });

  it('names each refusal the platform can give', async () => {
    const refusals = [
      [400, 'invalid_confirmation', 'confirmation'],
      [403, 'invalid_password', 'password'],
      [429, 'too_many_attempts', 'throttled'],
      [401, 'unauthenticated', 'signed-out'],
      [400, 'something_new', 'unknown'],
    ] as const;

    for (const [status, code, reason] of refusals) {
      const { api } = apiOver(async () => {
        throw new ApiError('refused', status, code, 'no');
      });

      await expect(deleteAccount(api, WORD, true)).resolves.toEqual({ status: 'refused', reason });
    }
  });

  it('answers offline when the platform did not answer, and unknown for anything else', async () => {
    const silent = apiOver(async () => {
      throw new ApiError('offline', null, null, 'down');
    });
    const broken = apiOver(async () => {
      throw new Error('boom');
    });

    await expect(deleteAccount(silent.api, WORD, true)).resolves.toEqual({
      status: 'refused',
      reason: 'offline',
    });
    await expect(deleteAccount(broken.api, WORD, true)).resolves.toEqual({
      status: 'refused',
      reason: 'unknown',
    });
  });

  it('sends the word as typed and the password only when the account has one', async () => {
    const { api, calls } = apiOver(async () => {});

    // The caller keeps the submit disabled while the word is wrong; the module still forwards what it
    // was given, because the server, and not this function, is the authority over the answer.
    await deleteAccount(api, { confirmation: 'DELETE ', password: 'password1234' }, true);
    await deleteAccount(api, { confirmation: 'DELETE', password: 'ignored' }, false);

    expect(calls).toEqual([{ confirm: 'DELETE ', password: 'password1234' }, { confirm: 'DELETE' }]);
  });
});
