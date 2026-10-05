// The reference catalog. Its keys are the `MessageKey` type, and every other locale is a partial
// map over them, so a key that only exists here is a compile error and never a silent miss.
//
// Keys are flat and prefixed with the area they belong to (`title.`, and `log.`, `panel.`, `map.`
// as M2 moves them), which is what lets a test ask for the title keys alone.
//
// M1 seeds the title screen only: it is the one area this feature translates, in M3. The values are
// the Portuguese the prototype wrote, moved here unchanged from `src/title/copy.ts`.

export const ptBR = {
  'title.meta': 'SECRETARIA DE ASSUNTOS OCULTOS · OCORRÊNCIA Nº 2026/0001',
  'title.name': 'Eldritch Alley',
  'title.stampTag': 'TACTICS',
  'title.tagline':
    'Agentes licenciados, magia sem licença e uma cidade inteira de becos. Monte o seu esquadrão e responda à ocorrência.',
  'title.cta': 'Iniciar partida',
  'title.ctaBusy': 'Conectando…',
  'title.hint': 'ou pressione Enter',
  'title.granted': 'PARTIDA AUTORIZADA',
  'title.unavailable': 'Servidor indisponível',
  'title.footerVersion': 'v0.1',
  'title.footerPlace': 'Belém · madrugada',
} as const;

/** Every message the client can show. Defined by the reference catalog, never by the translations. */
export type MessageKey = keyof typeof ptBR;
