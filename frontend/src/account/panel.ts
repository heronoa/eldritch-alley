// The profile panel as a view: what the card over the title says, read from the account the store
// holds. The DOM half writes these strings; every decision about which of them to show is made here,
// where a test can read it without a document.
import type { AccountCopy } from './copy';
import type { AccountState } from './types';

/** One agent of the squad: the class it plays and the level it reached. */
export interface AgentView {
  /** Stable across a redraw: the id the platform gave the agent. */
  readonly key: string;
  /** The class, as the fiction names it (`sniper`, `wizard`, `priest`). */
  readonly label: string;
  /** `nível 3` / `level 3`, already in the language on screen. */
  readonly level: string;
}

export interface ProfileView {
  /** The panel belongs to a signed-in player; a guest has no profile to show. */
  readonly hidden: boolean;
  readonly title: string;
  readonly name: string;
  readonly email: string | null;
  /** The avatar the platform knows, or `null`; the markup draws a stand-in when there is none. */
  readonly avatarUrl: string | null;
  readonly agentsHeading: string;
  readonly agents: readonly AgentView[];
  /** The line shown in place of the list when the squad is empty. */
  readonly noAgents: string;
  readonly signOutLabel: string;
  readonly historyLabel: string;
  /** The profile's action that opens the security card. */
  readonly securityLabel: string;
  readonly closeLabel: string;
}

/** Everything the profile card shows, in the language the copy was read in. */
export function profileView(state: AccountState, copy: AccountCopy): ProfileView {
  const shared = {
    title: copy.profileTitle,
    agentsHeading: copy.agentsHeading,
    noAgents: copy.noAgents,
    signOutLabel: copy.signOut,
    historyLabel: copy.historyLabel,
    securityLabel: copy.securityLabel,
    closeLabel: copy.close,
  };

  if (state.status !== 'signed-in') {
    return {
      ...shared,
      hidden: true,
      name: '',
      email: null,
      avatarUrl: null,
      agents: [],
    };
  }

  const { user, agents } = state.account;
  return {
    ...shared,
    hidden: false,
    name: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    // The order is the platform's: it lists the squad by class, and the panel does not reorder it.
    agents: agents.map((agent) => ({
      key: agent.id,
      label: agent.class,
      level: copy.level(agent.level),
    })),
  };
}
