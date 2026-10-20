import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLocale, setLocale, type Locale } from '../i18n';
import { accountCopy } from './copy';
import { profileView } from './panel';
import type { AccountState } from './types';

const ACCOUNT: AccountState = {
  status: 'signed-in',
  account: {
    user: {
      id: 'u-1',
      displayName: 'Ana Ribeiro',
      email: 'ana@example.com',
      avatarUrl: 'https://example.com/ana.png',
    },
    agents: [
      { id: 'a-1', class: 'priest', level: 3, status: 'ready' },
      { id: 'a-2', class: 'sniper', level: 1, status: 'ready' },
      { id: 'a-3', class: 'wizard', level: 2, status: 'ready' },
    ],
    hasPassword: true,
  },
};

describe('the profile view', () => {
  let previous: Locale;
  beforeEach(() => {
    previous = getLocale();
    setLocale('pt-BR');
  });
  afterEach(() => setLocale(previous));

  it('has nothing to show for a guest', () => {
    const view = profileView({ status: 'guest' }, accountCopy());

    expect(view.hidden).toBe(true);
    expect(view.name).toBe('');
    expect(view.email).toBeNull();
    expect(view.avatarUrl).toBeNull();
    expect(view.agents).toEqual([]);
  });

  it('shows the name, the address, the avatar and the security action of the signed-in player', () => {
    const view = profileView(ACCOUNT, accountCopy());

    expect(view.hidden).toBe(false);
    expect(view.name).toBe('Ana Ribeiro');
    expect(view.email).toBe('ana@example.com');
    expect(view.avatarUrl).toBe('https://example.com/ana.png');
    expect(view.securityLabel).toBe('Segurança');
  });

  it('lists the squad in the order the platform sent it, one level line per agent', () => {
    const view = profileView(ACCOUNT, accountCopy());

    expect(view.agents).toEqual([
      { key: 'a-1', label: 'priest', level: 'nível 3' },
      { key: 'a-2', label: 'sniper', level: 'nível 1' },
      { key: 'a-3', label: 'wizard', level: 'nível 2' },
    ]);
  });

  it('keeps an address the platform did not send as absent, and says the squad is empty', () => {
    const view = profileView(
      {
        status: 'signed-in',
        account: {
          user: { id: 'u-2', displayName: 'Sem Nome', email: null, avatarUrl: null },
          agents: [],
          hasPassword: false,
        },
      },
      accountCopy(),
    );

    expect(view.email).toBeNull();
    expect(view.avatarUrl).toBeNull();
    expect(view.agents).toEqual([]);
    expect(view.noAgents).toBe('Nenhum agente registrado');
  });

  it('speaks the language the client is in', () => {
    setLocale('en-US');
    const view = profileView(ACCOUNT, accountCopy());

    expect(view.title).toBe('Profile');
    expect(view.agentsHeading).toBe('Squad');
    expect(view.agents[0].level).toBe('level 3');
    expect(view.signOutLabel).toBe('Sign out');
    expect(view.historyLabel).toBe('History');
    expect(view.securityLabel).toBe('Security');
  });
});
