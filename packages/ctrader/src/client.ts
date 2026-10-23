import { PayloadType, type Envelope } from "./protocol";

/** The subset of the WebSocket API we use, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "close" | "error" | "message", listener: (event: { data?: unknown }) => void): void;
}

export type SocketFactory = (url: string) => SocketLike;

export class CTraderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(`${code}: ${message}`);
    this.name = "CTraderError";
  }
}

interface Pending {
  resolve: (envelope: Envelope) => void;
  reject: (error: Error) => void;
  expect: number;
  timer: ReturnType<typeof setTimeout>;
}

const OPEN = 1;

/** Request/response client for the cTrader Open API JSON protocol. */
export class CTraderClient {
  private socket: SocketLike | null = null;
  private pending = new Map<string, Pending>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private counter = 0;

  constructor(
    private readonly url: string,
    private readonly options: { timeoutMs?: number; socketFactory?: SocketFactory } = {},
  ) {}

  async connect(): Promise<void> {
    const factory = this.options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
    const socket = factory(this.url);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("cTrader connection failed")));
    });
    socket.addEventListener("message", (event) => this.onMessage(event.data));
    socket.addEventListener("close", () => this.failAll(new Error("cTrader connection closed")));
    this.heartbeat = setInterval(() => this.post({ payloadType: PayloadType.HEARTBEAT_EVENT, payload: {} }), 10_000);
  }

  request<T>(payloadType: number, expect: number, payload: Record<string, unknown>): Promise<T> {
    if (!this.socket || this.socket.readyState !== OPEN) {
      return Promise.reject(new Error("cTrader client is not connected"));
    }
    const clientMsgId = `tj_${++this.counter}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(clientMsgId);
        reject(new Error(`cTrader request ${payloadType} timed out`));
      }, this.options.timeoutMs ?? 15_000);
      this.pending.set(clientMsgId, {
        resolve: (env) => resolve(env.payload as T),
        reject,
        expect,
        timer,
      });
      this.post({ clientMsgId, payloadType, payload });
    });
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.failAll(new Error("cTrader client closed"));
    this.socket?.close();
    this.socket = null;
  }

  private post(envelope: Envelope) {
    this.socket?.send(JSON.stringify(envelope));
  }

  private onMessage(data: unknown) {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(String(data)) as Envelope;
    } catch {
      return;
    }
    if (!envelope.clientMsgId) return; // events and heartbeats
    const pending = this.pending.get(envelope.clientMsgId);
    if (!pending) return;
    this.pending.delete(envelope.clientMsgId);
    clearTimeout(pending.timer);

    if (envelope.payloadType === PayloadType.ERROR_RES) {
      const p = envelope.payload as { errorCode?: string; description?: string; retryAfter?: number };
      pending.reject(new CTraderError(p.errorCode ?? "UNKNOWN", p.description ?? "Request failed", p.retryAfter));
    } else if (envelope.payloadType !== pending.expect) {
      pending.reject(new Error(`Unexpected cTrader response ${envelope.payloadType}`));
    } else {
      pending.resolve(envelope);
    }
  }

  private failAll(error: Error) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(error);
      this.pending.delete(id);
    }
  }
}
