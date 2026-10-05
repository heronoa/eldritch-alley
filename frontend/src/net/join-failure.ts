// Client side of a refused join: which failure a caught value describes.
//
// The battle room refuses a second human by throwing `Error('room full')` in `onJoin`. That message
// crosses the wire unchanged — the transport sends `client.error(e.code, e.message)`, and the SDK
// hands it back as a `ServerError` whose `message` is the same string. The thrown value is a plain
// `Error`, so its `code` arrives as `undefined`, which is why the reason is read from the text and
// not from a code.
//
// This module is the only place in the client that knows that string. A server that rewords the
// `throw` sends every second tab back to "server unavailable" with nothing failing, so the text is
// pinned on both sides of the boundary: here, and in `battle-room.test.ts` on the server.

/** Why a session ended on a failure. */
export type JoinFailure = 'occupied' | 'unavailable';

/** What the battle room answers when its one human seat is already taken. */
const ROOM_FULL = 'room full';

/**
 * Which failure a caught value describes: `'occupied'` when the room refused the seat because
 * another session holds it, `'unavailable'` for everything else.
 *
 * Never throws. A value that is not an `Error` at all — a `null`, a bare string, a plain object — is
 * not a refusal the room sent, so it reads as the generic failure.
 */
export function joinFailure(error: unknown): JoinFailure {
  if (error instanceof Error && error.message.includes(ROOM_FULL)) return 'occupied';
  return 'unavailable';
}
