// Title screen M2 — the sheets the title draws its walkers from, and the one 16×24 frame of a sheet
// at a time. A frame is addressed the way the rest of the client addresses a sprite: a row of ten
// columns, counted with `frameIndex` from `unit-look.ts`.
//
// The neutral sheet is the roster as the match sheets have it — seven rows of ten columns — with the
// grey armband the title gives every class, because there are no teams on the title. Its twin, the
// blink sheet, is the same sheet with the sniper's scope glint and the vendor's amulet lit; the two
// are swapped frame by frame, as the prototype's own time-based blinks do.
import { frameIndex } from '../view/unit-look';
import type { WalkerKey } from './walkers';

/** The sheets the title needs in memory: the neutral one, and its lit twin. */
export type SheetName = 'neutral' | 'blink';

/**
 * Where each sheet is served from. `public/` is the root of the built site, and the path is relative
 * so a build under a sub-path still finds it.
 */
export const SHEET_SOURCE: Record<SheetName, string> = {
  neutral: 'sprites/spritesheet-neutral.png',
  blink: 'sprites/spritesheet-neutral-blink.png',
};

/** One frame of a sheet: 16×24, the size every class of the roster is drawn at. */
export const FRAME_WIDTH = 16;
export const FRAME_HEIGHT = 24;

/** Ten columns per row, in the order `unit-look.ts` reads them. */
const COLUMNS_PER_ROW = 10;

/**
 * The row of the sheet a class walks on, in the order the characters README lists them: the three
 * base classes, then the four advanced ones. The match sheets carry the same seven rows; the title
 * is the screen that uses all of them.
 */
export const CLASS_ROW: Record<WalkerKey, number> = {
  combatant: 0,
  initiate: 1,
  adept: 2,
  sniper: 3,
  wizard: 4,
  priest: 5,
  vendor: 6,
};

/** The sheets, once they are in memory. */
export type Sheets = Record<SheetName, HTMLImageElement>;

/** The top-left of a frame inside its sheet, and the sheet it is a frame of. */
export interface Frame {
  readonly image: HTMLImageElement;
  readonly x: number;
  readonly y: number;
}

/** Loads both sheets. The title draws nothing until this resolves. */
export async function loadSheets(): Promise<Sheets> {
  const [neutral, blink] = await Promise.all([
    loadImage(SHEET_SOURCE.neutral),
    loadImage(SHEET_SOURCE.blink),
  ]);
  return { neutral, blink };
}

/** The frame at `row`, `column` of a sheet. The caller draws it; this only says where it is. */
export function frameOf(
  sheets: Sheets,
  sheet: SheetName,
  row: number,
  column: number,
): Frame {
  const index = frameIndex(row, column);
  return {
    image: sheets[sheet],
    x: (index % COLUMNS_PER_ROW) * FRAME_WIDTH,
    y: Math.floor(index / COLUMNS_PER_ROW) * FRAME_HEIGHT,
  };
}

/** Decodes one sheet. A sheet that will not load is an error: there is no title without them. */
function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`the title could not load ${source}`));
    image.src = source;
  });
}
