/**
 * WebSocket connection manager for live updates.
 * Handles auto-reconnection with exponential backoff, keepalive pings,
 * connection status callbacks, and catch-up on reconnect.
 * Uses Supabase JWT for authentication.
 */

import { createClient } from "@/lib/supabase";

type MessageHandler = (data: WebSocketMessage) => void;
type StatusHandler = (connected: boolean) => void;

export interface WebSocketMessage {
  type: 'log' | 'trade' | 'status' | 'pong';
  agent_id?: string;
  level?: string;
  message?: string;
  environment?: 'training' | 'actual';
  [key: string]: unknown;
}

// Derive WS URL from the API URL (same backend host) or fall back to window.location
function buildWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    // Convert http(s)://host:port -> ws(s)://host:port/ws
    return apiUrl.replace(/^http/, 'ws') + '/ws';
  }

  if (typeof window !== 'undefined') {
    return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  }

  return 'ws://localhost:8000/ws';
}

const WS_URL = buildWsUrl();

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private connected = false;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime: number = 0;

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      // Connect without token in URL — auth is sent as first message
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = async () => {
        // Send auth token as first message (avoids token leaking in URL/logs)
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'auth', token: session.access_token }));
          }
        } catch {
          // Continue — backend will close if auth is required
        }
        this.connected = true;
        this.reconnectDelay = 1000;
        this.startKeepalive();
        this.notifyStatus(true);
        console.log('[WS] Connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          this.lastMessageTime = Date.now();
          this.handlers.forEach((handler) => handler(data));
        } catch {
          // Non-JSON message, ignore
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.stopKeepalive();
        this.notifyStatus(false);
        console.log('[WS] Disconnected, scheduling reconnect...');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.notifyStatus(false);
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  disconnect() {
    this.stopKeepalive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.notifyStatus(false);
  }

  private startKeepalive() {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      this.sendPing();
    }, 15000); // 15s heartbeat
  }

  private stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private notifyStatus(connected: boolean) {
    this.statusHandlers.forEach((handler) => handler(connected));
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    // Auto-connect on first subscriber
    if (this.handlers.size === 1) this.connect();
    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) this.disconnect();
    };
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    // Immediately notify current status
    handler(this.connected);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  get isConnected() {
    return this.connected;
  }

  sendPing() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
