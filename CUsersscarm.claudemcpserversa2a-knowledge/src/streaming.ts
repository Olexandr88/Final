import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

type Subscriber = {
  ws: WebSocket;
};

type Channel = {
  id: string;
  subs: Set<Subscriber>;
};

const channels = new Map<string, Channel>();
const seqMap = new Map<string, number>();
const alive = new WeakMap<WebSocket, boolean>();

export type StreamEvent =
  | { type: 'start'; requestId: string; ts: number; seq?: number }
  | { type: 'chunk'; requestId: string; ts: number; content: string; seq?: number }
  | { type: 'final'; requestId: string; ts: number; result?: unknown; seq?: number }
  | { type: 'error'; requestId: string; ts: number; message: string; seq?: number };

export class StreamHub {
  private wss: WebSocketServer;
  public urlBase: string;
  private hb?: ReturnType<typeof setInterval>;
  private token?: string;
  private maxSubsPerRequest: number;

  constructor(port: number = 8787, host: string = '127.0.0.1', opts?: { token?: string; maxSubsPerRequest?: number }) {
    this.wss = new WebSocketServer({ port, host, perMessageDeflate: true, maxPayload: 2 * 1024 * 1024 });
    this.urlBase = `ws://${host}:${port}`;
    this.token = opts?.token;
    this.maxSubsPerRequest = Math.max(1, opts?.maxSubsPerRequest ?? 16);

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url || '', this.urlBase);
      const requestId = url.searchParams.get('requestId');
      if (!requestId) {
        ws.close(1008, 'requestId required');
        return;
      }

      if (this.token) {
        const tokenParam = url.searchParams.get('token');
        const authHeader = (req.headers?.authorization || '').toString();
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
        const provided = tokenParam || bearer;
        if (provided !== this.token) {
          ws.close(1008, 'invalid token');
          return;
        }
      }

      const chan = ensureChannel(requestId);
      if (chan.subs.size >= this.maxSubsPerRequest) {
        ws.close(1008, 'too many subscribers for request');
        return;
      }
      const sub: Subscriber = { ws };
      chan.subs.add(sub);

      alive.set(ws, true);
      ws.on('pong', () => alive.set(ws, true));

      ws.on('close', () => {
        chan.subs.delete(sub);
        if (chan.subs.size === 0) {
          channels.delete(requestId);
          seqMap.delete(requestId);
        }
      });
    });

    // Heartbeat for dead connection cleanup
    this.hb = setInterval(() => {
      for (const ws of this.wss.clients) {
        const ok = alive.get(ws);
        if (ok) {
          alive.set(ws, false);
          try { ws.ping(); } catch {}
        } else {
          try { ws.terminate(); } catch {}
        }
      }
    }, 30000);
  }

  broadcast(requestId: string, ev: StreamEvent) {
    const chan = channels.get(requestId);
    if (!chan) return;
    const seq = (seqMap.get(requestId) || 0) + 1;
    seqMap.set(requestId, seq);
    const payload = JSON.stringify({ ...ev, seq });
    for (const { ws } of chan.subs) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }

  channelUrl(requestId: string, token?: string) {
    const q = new URLSearchParams({ requestId });
    if (token) q.set('token', token);
    return `${this.urlBase}/stream?${q.toString()}`;
  }

  clientCount() {
    return this.wss.clients.size;
  }

  channelCount() {
    return channels.size;
  }

  close() {
    if (this.hb) clearInterval(this.hb);
    try { this.wss.close(); } catch {}
  }
}

function ensureChannel(id: string): Channel {
  let chan = channels.get(id);
  if (!chan) {
    chan = { id, subs: new Set() };
    channels.set(id, chan);
  }
  return chan;
}
