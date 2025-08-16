type WebSocketEventType = 'open' | 'message' | 'close' | 'error';

export class MockWebSocket {
  public readyState: number = WebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  public sentMessages: string[] = [];
  public eventLog: { type: WebSocketEventType; data?: unknown }[] = [];


  constructor(public url: string) {
    // Simulate async open
    setImmediate(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event('open'));
    });
  }

  send(data: string) {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { wasClean: false, code, reason }));
  }

  // Test helper to simulate an incoming JSON message
  mockReceive(obj: unknown) {
    const data = typeof obj === "string" ? obj : JSON.stringify(obj);
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  mockError(errorData?: unknown) {
    const err = new Event('error');
    this.logEvent('error', errorData ?? err);
    this.onerror?.(err);
  }

  mockClose(code = 1006, reason = 'Unexpected closure') {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.logEvent('close', { code, reason });
    this.onclose?.(new CloseEvent('close', { wasClean: false, code, reason }));
  }

  private logEvent(type: WebSocketEventType, data?: unknown) {
    this.eventLog.push({ type, data });
  }
}
