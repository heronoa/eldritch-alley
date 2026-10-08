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
  'log.event.damaged': '{target} took {damage} damage',
  'log.event.healed': '{target} recovered {amount} health',
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
  // The badge a unit in cover wears over its head. The sides are the board's own (m3-02, D1).
  'hud.cover.sides': 'In cover for {sides}',
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
