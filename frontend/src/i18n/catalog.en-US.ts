// The English catalog. It translates every key of the reference, so a player who picks EN reads EN on
// every screen, the battle log included.
//
// The title screen's copy is the one the owner reviewed (decision 10 of the plan): the title's tone is
// noir and deliberate, so those sentences were written again in English rather than carried over word
// by word. The rest is a faithful translation of the reference. The setting keeps its own names in
// either language: Belém, Rua do Comércio and Praça Municipal are where the story happens.
//
// The type is the whole reference, so a key missing here is a compile error and never a Portuguese
// line inside an English screen. A key that the reference does not define is an error too.

import type { MessageKey } from './catalog.pt-BR';

export const enUS: Record<MessageKey, string> = {
  // The title screen. `name`, `stampTag`, `footerVersion` and `document` are the same in both
  // locales: the game's name is not translated, and the version is a number.
  'title.document': 'Eldritch Alley: Tactics',
  'title.meta': 'BUREAU OF OCCULT AFFAIRS · INCIDENT NO. 2026/0001',
  'title.name': 'Eldritch Alley',
  'title.stampTag': 'TACTICS',
  'title.tagline':
    'Licensed agents, unlicensed magic, and a whole city of alleys. Assemble your squad and respond to the incident.',
  'title.cta': 'Start match',
  'title.ctaBusy': 'Connecting…',
  'title.hint': 'or press Enter',
  'title.granted': 'MATCH AUTHORIZED',
  'title.unavailable': 'Server unavailable',
  'title.occupied': 'You already have a match open in another tab',
  'title.loadFailed': 'The match could not be loaded',
  'title.notice.refused': 'ACCESS REFUSED',
  'title.notice.loadFailed': 'FAILED TO LOAD',
  'title.notice.close': 'Close',
  'title.footerVersion': 'v0.1',
  'title.footerPlace': 'Belém · the small hours',
  'title.language': 'Language',

  // The onboarding: the cards of the admission test. Written again in English rather than carried over
  // word by word, like the title's copy above — same tone, and the same room for the owner to rewrite
  // them before the milestone closes.
  'onboarding.story-incident.heading': 'Incident opened',
  'onboarding.story-incident.body':
    'The Bureau of Occult Affairs opened an incident in the alley behind the market: unlicensed magic, three witnesses, and no explanation that holds up.',
  'onboarding.story-admission.heading': 'The admission test',
  'onboarding.story-admission.body':
    'The Supernatural Control Agency licenses who may work magic in the city. There is no written exam: your admission is the match you are about to play.',
  'onboarding.story-squad.heading': 'Your squad',
  'onboarding.story-squad.body':
    'You go into the alley with three agents — a sniper, a wizard and a priest. Each brings their own class, their own weapon or magic, and their own idea of what is worth the risk.',

  'onboarding.grid-and-height.heading': 'The grid has height',
  'onboarding.grid-and-height.body':
    'The map is a grid of cells, and every cell has a level: pavement, first floor, rooftop. Climbing costs movement, and each class climbs so much per step. Whoever stands higher sees farther, shoots farther and hits more often.',
  'onboarding.initiative-order.heading': 'The initiative queue',
  'onboarding.initiative-order.body':
    'The turn order comes from each unit’s speed and is visible to both sides, in the queue at the top of the screen. On its turn, a unit may move and act, in whichever order you like.',
  'onboarding.move-and-attack.heading': 'Moving and attacking',
  'onboarding.move-and-attack.body':
    'Pick Move to see the cells in reach and click the one you want; pick Attack and click the target. An enemy’s back and flank give a bonus to hit and to damage — which way it faces matters.',
  'onboarding.ammo-and-reload.heading': 'Ammunition and energy',
  'onboarding.ammo-and-reload.body':
    'Weapon classes spend ammunition and top it up with Reload; magic classes spend energy, which comes back a little each round through that same action — the battle log calls it meditating. The pips above the unit show what is left.',
  'onboarding.cover-and-chance.heading': 'Cover and hit chance',
  'onboarding.cover-and-chance.body':
    'Walls, cars and crates give cover and cut the line of sight: a shot against cover lands less often. Aim at a target and the green badge above it shows that shot’s chance, as a percentage, before you take it.',
  'onboarding.abilities.heading': 'Abilities',
  'onboarding.abilities.body':
    'Every class carries abilities: area magic, heals, strikes of its own. The Ability button opens the list, shows what each one costs, and draws the cells it reaches on the map before you commit.',

  'onboarding.advance': 'Continue',
  'onboarding.back': 'Back',
  'onboarding.skip': 'Skip',
  'onboarding.finish': 'Finish',
  'onboarding.howToPlay': 'How to play',

  // The account (m4-04): the control in the corner, the sign-in dialog, the profile and the history.
  'account.control': 'Account',
  'account.dialog.title': 'Account',
  'account.signIn': 'Sign in',
  'account.signOut': 'Sign out',
  'account.close': 'Close',
  'account.tab.signIn': 'Sign in',
  'account.tab.signUp': 'Create account',
  'account.tab.forgot': 'Forgot password',
  'account.providers': 'Sign in with',
  'account.provider.keycloak': 'SSO',
  'account.provider.github': 'GitHub',
  'account.provider.google': 'Google',
  'account.field.email': 'Email address',
  'account.field.password': 'Password',
  'account.field.confirmation': 'Repeat password',
  'account.field.displayName': 'Agent name',
  'account.password.hint': '12 to 128 characters',
  'account.submit.signIn': 'Sign in',
  'account.submit.signUp': 'Create account',
  'account.submit.forgot': 'Send the link',
  'account.checkMail.heading': 'Check your email',
  'account.checkMail.body':
    'If this address has an account, the link is on its way. Open it in this browser.',
  'account.checkMail.back': 'Back',
  'account.problem.invalidCredentials': 'Wrong address or password',
  'account.problem.emailNotVerified': 'Confirm your email before signing in',
  'account.problem.tooManyAttempts': 'Too many attempts. Wait a few minutes.',
  'account.problem.offline': 'The service did not answer',
  'account.problem.unknown': 'The request could not be completed',
  'account.problem.invalidPassword': 'The password must be 12 to 128 characters',
  'account.problem.invalidBody': 'Check what was filled in',
  'account.problem.tooShort': 'The password must be at least 12 characters',
  'account.problem.tooLong': 'The password cannot be longer than 128 characters',
  'account.problem.mismatch': 'The two passwords do not match',
  'account.profile.title': 'Profile',
  'account.profile.agents': 'Squad',
  'account.profile.noAgents': 'No agents on record',
  'account.profile.level': 'level {level}',
  'account.history': 'History',
  'account.history.title': 'Battle history',
  'account.history.empty': 'No battles on record yet',
  'account.history.loadMore': 'Load more',
  'account.history.loading': 'Loading…',
  'account.history.failure': 'The history could not be loaded',
  'account.history.rounds': '{rounds} rounds',
  'account.history.won': 'Victory',
  'account.history.lost': 'Defeat',

  // The security card and the deletion confirmation. The confirmation word is not copy: `DELETE` is
  // spelled the same in both languages because it is the token the platform checks
  // (`frontend/src/account/delete-account.ts`).
  'account.security.label': 'Security',
  'account.security.methods.password': 'Signs in with an email and a password',
  'account.security.methods.provider': 'Signs in through an identity provider',
  'account.security.delete': 'Delete account',
  'account.delete.title': 'Delete account',
  'account.delete.warning':
    'The account, the squad and the battle history will be erased. This cannot be undone.',
  'account.delete.confirmLabel': 'Type DELETE to confirm',
  'account.delete.submit': 'Delete account',
  'account.delete.cancel': 'Cancel',
  'account.delete.problem.confirmation': 'Type DELETE exactly as written',
  'account.delete.problem.password': 'Wrong password',
  'account.delete.problem.signedOut': 'Your session has ended. Sign in again.',

  // The two pages a mailed link lands on.
  'mail.verify.heading': 'Confirm your email',
  'mail.verify.body': 'Press the button to confirm this address and sign in to your account.',
  'mail.verify.action': 'Confirm address',
  'mail.verify.working': 'Confirming…',
  'mail.verify.doneHeading': 'Address confirmed',
  'mail.verify.doneBody': 'Your account is ready. Go back to the start and begin a match.',
  'mail.reset.heading': 'Choose a new password',
  'mail.reset.body': 'Choose a password of 12 to 128 characters.',
  'mail.reset.action': 'Save the password',
  'mail.reset.working': 'Saving…',
  'mail.reset.doneHeading': 'Password changed',
  'mail.reset.doneBody': 'You can now sign in with the new password.',
  'mail.invalid.heading': 'This link no longer works',
  'mail.invalid.body': 'Links work once. Ask for another from the start screen.',
  'mail.missing.heading': 'Incomplete link',
  'mail.missing.body': 'This address brought no token. Open the link from the email again.',
  'mail.back': 'Back to the start',

  // The battle log. One sentence per event, and the placeholders are filled by `interpolate`.
  'log.event.moved': '{actor} moved from {from} to {to}',
  'log.event.attacked': '{actor} hit {target} for {damage}',
  // Which end of the shot the crate was on is the whole difference between the four pairs, and the
  // shooter's own cover is read on the board (ADR 0012 § D4, ADR 0013).
  'log.event.attackedCover': '{actor} hit {target} for {damage} in cover',
  'log.event.missed': '{actor} missed {target}',
  'log.event.missedCover': '{actor} missed {target} in cover',
  'log.event.attackedFromCover': '{actor}, in cover, hit {target} for {damage}',
  'log.event.missedFromCover': '{actor}, in cover, missed {target}',
  'log.event.attackedBothCover': '{actor}, in cover, hit {target} for {damage}, who was in cover too',
  'log.event.missedBothCover': '{actor}, in cover, missed {target}, who was in cover too',
  'log.event.reloaded': '{actor} reloaded',
  // The same action for a magic class (ADR 0011 §3): the engine calls it a reload either way, and the
  // player reads the word of their own class.
  'log.event.meditated': '{actor} meditated',
  'log.event.defeated': '{target} fell',
  'log.event.corpseRemoved': 'Body of {target} removed',
  'log.event.turnEnded': 'Turn of {next}',
  'log.event.regained': '{actor} regained {amount} mana',
  // The use of an ability (ADR 0016): the action names a cell, never a unit, and the two outcomes
  // of the use follow as events of their own.
  'log.event.ability-used': '{actor} used an ability on {cell}',
  'log.event.ability-used-named': '{actor} used {ability} on {cell}',
  'log.event.damaged': '{target} took {damage} damage',
  'log.event.healed': '{target} recovered {amount} health',
  // The four events of the second active set (ADR 0023 §4). A camouflage ends for one of two reasons,
  // and the sentence says which: the turns ran out, or a blow broke it.
  'log.event.camouflageExpired': "{target}'s camouflage faded",
  'log.event.camouflageBroken': "{target}'s camouflage broke",
  'log.event.stoodUp': '{actor} stood up',
  'log.event.terrainExpired': 'The ground dried up',
  'log.event.revived': '{target} is back on their feet',
  'log.event.unknown': 'unknown event',

  // One sentence per `RejectReason`, keyed by the code the server answers with. `unknown` is the
  // fallback for a reason this build does not know.
  'log.rejection.not-your-turn': 'Not your turn',
  'log.rejection.out-of-bounds': 'Off the board',
  'log.rejection.cell-occupied': 'Cell occupied',
  'log.rejection.height-step-too-high': 'Step too high',
  'log.rejection.no-path': 'No path',
  'log.rejection.already-acted': 'Action already used',
  'log.rejection.target-out-of-range': 'Target out of range',
  'log.rejection.no-line-of-sight': 'No line of sight',
  // A camouflaged enemy cannot be the target of a basic attack (ADR 0023).
  'log.rejection.target-hidden': 'Target hidden',
  'log.rejection.target-invalid': 'Invalid target',
  'log.rejection.ability-unknown': 'Unknown ability',
  'log.rejection.no-magazine': 'No magazine',
  // The pool of a basic attack is empty: a magazine to reload, or energy to meditate (ADR 0011). The
  // key keeps the engine's own word for the mechanism, mana; what the player reads is energy.
  'log.rejection.no-ammunition': 'No ammunition — reload',
  'log.rejection.no-mana': 'No energy — meditate',
  'log.rejection.magazine-full': 'Magazine full',
  'log.rejection.game-over': 'Match over',
  // A command that names a round the match has left behind: the order arrived too late (EA-4).
  'log.rejection.stale-turn': 'Order too late',
  'log.rejection.malformed-action': 'Invalid action',
  // A cancel or a confirmation of a move that is not waiting to be confirmed (EA-5).
  'log.rejection.no-pending-move': 'No move waiting to be confirmed',
  'log.rejection.unknown': 'Action refused',

  // The unit panel, one label per `PanelKey`, and the two words a turn row can show. The two resource
  // rows are the two kinds of pool: the Sniper's rounds stay ammunition, a magic class reads energy.
  'panel.label.hp': 'HP',
  'panel.label.movement': 'Movement',
  'panel.label.action': 'Action',
  'panel.label.ammo': 'Ammo',
  'panel.label.reaction': 'Reaction',
  'panel.label.energy': 'Energy',
  'panel.value.spent': 'Spent',
  'panel.value.available': 'Available',

  // The action bar, one label per button id in `actionButtons`, and the two controls a pending move
  // floats above it (EA-5): they are not buttons of the bar, but they are read the same way.
  'action.move': 'Move',
  'action.attack': 'Attack',
  'action.ability': 'Ability',
  'action.reload': 'Reload',
  'action.endTurn': 'End turn',
  'action.confirmMove': 'Confirm',
  'action.cancelMove': 'Cancel',
  // Shown instead, in place of the label above, while the turn still has something left to do and
  // End Turn is asking once before it is sent (M4 playtest fix, P3).
  'action.confirmEndTurn': 'Sure?',

  // The abilities (EA-16): one word per id this build knows, and the fragments of the effect line.
  'ability.piercing-shot': 'Piercing Shot',
  'ability.fireball': 'Fireball',
  'ability.area-heal': 'Area Heal',
  // The three abilities of the second active set (ADR 0023 §2).
  'ability.camouflage': 'Camouflage',
  'ability.mud': 'Mud',
  'ability.resurrection': 'Resurrection',
  'ability.detail.damage': 'Damage {amount}',
  'ability.detail.heal': 'Heal {amount}',
  'ability.detail.radius': 'radius {radius}',
  'ability.detail.ignoresCover': 'ignores cover',
  'ability.detail.hitsAllies': 'hits everyone, allies included',
  // The three new effects, each fragment read from the definition the match carries (ADR 0023 §2).
  'ability.detail.camouflage': '{turns} turns',
  'ability.detail.breakChance': '{chance}% break',
  'ability.detail.terrain': '{rounds} rounds',
  'ability.detail.difficultTerrain': 'difficult terrain',
  'ability.detail.revive': 'Revive a fallen ally',

  // The rest of the HUD, and the lines the match shows over it.
  'hud.legend':
    'Ink blue: you · Red: bot · Paper: selected\nBlue highlight: movement · Red highlight: attack',
  'hud.panel.log': 'Log',
  'inspect.title': 'Unit sheet',
  'hud.back': 'Back to start',
  // The banner a turn change raises, one line per side.
  'hud.banner.yourTurn': 'Your turn',
  'hud.banner.enemyTurn': 'Enemy turn',
  // The automatic end of turn (EA-4): the countdown, the way out of it, and the hint the button shows
  // when the feature is off.
  'hud.autoEndTurn.countdown': 'Turn ends in {seconds}s',
  'hud.autoEndTurn.link': "Don't pass automatically",
  'hud.autoEndTurn.hint': 'Nothing left to do: end the turn',
  // The settings panel the gear opens: the toggle of the automatic end of turn, and the stepper of the
  // drag sensitivity (owner's request) with the value it reads between its two signs.
  'hud.settings': 'Settings',
  'hud.settings.autoEndTurn': 'Pass the turn automatically',
  'hud.settings.panSensitivity': 'Map drag',
  'hud.settings.panSensitivity.value': '{percent}%',
  'hud.settings.highlightCovers': 'Highlight Covers',
  // The battle report (EA-17): the modal that opens the moment a match ends.
  'hud.report.title': 'Battle log',
  'hud.report.export': 'Download .txt',
  'hud.report.reopen': 'View full log',
  'hud.report.range': '{from}-{to} of {total}',
  // The odds over a unit's head while it is being aimed at (EA-18). Named rather than a bare number
  // (M5 playtest polish).
  'hud.target.chance': 'Hit {value}%',
  // The badge a unit in cover wears over its head. The sides are the board's own (m3-02, D1).
  // Shortened to a label pairing with `hud.target.chance` above it (M5 playtest polish).
  'hud.cover.sides': 'Cover: {sides}',
  'hud.cover.and': ' and ',
  'hud.cover.north': 'North',
  'hud.cover.northeast': 'Northeast',
  'hud.cover.east': 'East',
  'hud.cover.southeast': 'Southeast',
  'hud.cover.south': 'South',
  'hud.cover.southwest': 'Southwest',
  'hud.cover.west': 'West',
  'hud.cover.northwest': 'Northwest',
  // The camera panel (EA-12): the view the camera looks from, the zoom step it is on, and the letter
  // each direction is written as.
  'hud.camera': 'Camera',
  'hud.camera.view': 'VIEW {direction}',
  'hud.camera.zoom': '{step}x',
  'hud.camera.north': 'N',
  'hud.camera.east': 'E',
  'hud.camera.south': 'S',
  'hud.camera.west': 'W',
  'match.versionMismatch': 'Incompatible version',
  'match.victory': 'Victory',
  'match.defeat': 'Defeat',
  'match.reconnecting': 'Reconnecting...',
  'match.lost': 'Match lost',

  // The map names, and the name of every tile the prototype draws.
  'map.street.title': 'Commerce Street and alley',
  'map.park.title': 'Municipal Square No. 3',
  'map.roof.title': 'Central Building, rooftop',
  'terrain.a': 'asphalt',
  'terrain.s': 'sidewalk',
  'terrain.x': 'alley',
  'terrain.d': 'loading dock',
  'terrain.g': 'grass',
  'terrain.p': 'path',
  'terrain.w': 'lake',
  'terrain.q': 'square',
  'terrain.r': 'slab',
  'terrain.R': 'roof gravel',
  'terrain.B': 'building (blocked)',
  'terrain.z': 'crosswalk',
  'terrain.f': 'fenced parking (blocked)',
  'terrain.h': 'machine room (blocked)',
  'terrain.b': 'plank over the gap',
  'terrain.k': 'neighbouring roof',
  'terrain.v': 'gap between buildings',
};
