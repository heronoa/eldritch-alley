// Client side of the match protocol: joins the battle room, keeps the reconnection token and
// forwards every message to the subscribers.
//
// Handlers are registered after `connect()`: the room only exists from then on, and they stay
// registered across a reconnection.
import { Client, type Room } from '@colyseus/sdk';
import {
  MESSAGE,
  ROOM_NAME,
  type ClientAction,
  type EndedMessage,
  type Event,
  type RejectedMessage,
  type StateMessage,
} from '../protocol';

/** Where the reconnection token is kept, so a reload can pick the match back up. */
const RECONNECT_KEY = 'ea.reconnect';

/**
 * Storage is optional: a browser may refuse it (private mode, blocked cookies) and the session has
 * to keep working, only without the ability to reconnect after a reload.
 */
function readToken(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(RECONNECT_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeToken(token: string): void {
  try {
    globalThis.sessionStorage?.setItem(RECONNECT_KEY, token);
  } catch {
    // Without storage the match still plays; only a reload would lose the seat.
  }
}

/** Wires one subscription onto a room and answers how to take it off again. */
type Attach = (room: Room) => () => void;

export class Session {
  private readonly client: Client;
  private room: Room | null = null;
  private readonly subscriptions = new Set<Attach>();
  /**
   * The last state the server sent. A room sends it once, on join, and that often happens while the
   * scene that draws it is still being created — so it is kept for whoever subscribes late.
   */
  private lastState: StateMessage | null = null;

  constructor(endpoint: string) {
    this.client = new Client(endpoint);
  }

  /** Joins a match. The reconnection token is stored when the browser lets it be. */
  async connect(): Promise<void> {
    // A new match brings a new board: the previous room's state must not be handed to anyone.
    this.lastState = null;
    this.attachRoom(await this.client.joinOrCreate(ROOM_NAME));
  }

  /** Sends an action. Before `connect()` there is nothing to send it to, so this does nothing. */
  send(action: ClientAction): void {
    this.room?.send(MESSAGE.action, action);
  }

  /**
   * The state of the match: the one already in hand right away, then every new one. Subscribing is
   * therefore enough to draw the board, whenever the subscription happens to be made.
   */
  onState(handler: (message: StateMessage) => void): () => void {
    const unsubscribe = this.subscribe((room) => room.onMessage(MESSAGE.state, handler));
    if (this.lastState !== null) handler(this.lastState);
    return unsubscribe;
  }

  onEvents(handler: (events: Event[]) => void): () => void {
    return this.subscribe((room) => room.onMessage(MESSAGE.events, handler));
  }

  onRejected(handler: (message: RejectedMessage) => void): () => void {
    return this.subscribe((room) => room.onMessage(MESSAGE.rejected, handler));
  }

  onEnded(handler: (message: EndedMessage) => void): () => void {
    return this.subscribe((room) => room.onMessage(MESSAGE.ended, handler));
  }

  /** Called the moment the connection to the room is lost, before any reconnection attempt. */
  onDrop(handler: () => void): () => void {
    return this.subscribe((room) => {
      room.onDrop(handler);
      return () => room.onDrop.remove(handler);
    });
  }

  /** Takes a stored token back to its match. Answers false when there is no token left to use. */
  async reconnect(): Promise<boolean> {
    const token = readToken();
    if (token === null) return false;

    try {
      this.attachRoom(await this.client.reconnect(token));
      return true;
    } catch {
      return false;
    }
  }

  private attachRoom(room: Room): void {
    // The SDK's own reconnection is off: `reconnect()` and the scene decide when to try, instead of
    // the SDK retrying behind them for the same seat.
    room.reconnection.enabled = false;
    this.room = room;
    writeToken(room.reconnectionToken);
    // Registered first, so the cache is already up to date by the time the subscribers run.
    room.onMessage(MESSAGE.state, (message: StateMessage) => {
      this.lastState = message;
    });
    for (const subscription of this.subscriptions) subscription(room);
  }

  /**
   * Registers a handler now and on every later room. A reconnection hands back a *new* room, and a
   * handler left on the old one would go silent without a word.
   */
  private subscribe(attach: Attach): () => void {
    let detach: (() => void) | null = null;
    const tracked: Attach = (room) => {
      detach = attach(room);
      return detach;
    };
    if (this.room !== null) tracked(this.room);
    this.subscriptions.add(tracked);
    return () => {
      detach?.();
      detach = null;
      this.subscriptions.delete(tracked);
    };
  }
}
