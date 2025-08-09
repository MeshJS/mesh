type WebSocketEventType = 'open' | 'message' | 'close' | 'error';

export class MockWebSocket {
  public readyState: number = WebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  public sentMessages: unknown[] = [];
  public eventLog: { type: WebSocketEventType; data?: unknown }[] = [];

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.logEvent('open');
      this.onopen?.(new Event('open'));
    }, 0);
  }

  send(data: unknown) {
    if (this.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.logEvent('message', data);
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = 'Normal closure') {
    this.readyState = WebSocket.CLOSED;
    const event = new CloseEvent('close', { wasClean: true, code, reason });
    this.logEvent('close', { code, reason });
    this.onclose?.(event);
  }

  // Test hooks
  mockReceive(data: string | ArrayBuffer | Blob, delay = 0) {
    setTimeout(() => {
      this.logEvent('message', data);
      this.onmessage?.(new MessageEvent('message', { data }));
    }, delay);
  }

  mockBinaryReceive(binary: ArrayBuffer | Uint8Array | Blob, delay = 0) {
    this.mockReceive(binary, delay);
  }

  mockError(errorData?: unknown) {
    const err = new Event('error');
    this.logEvent('error', errorData ?? err);
    this.onerror?.(err);
  }

  mockClose(code = 1006, reason = 'Unexpected closure') {
    this.readyState = WebSocket.CLOSED;
    this.logEvent('close', { code, reason });
    this.onclose?.(new CloseEvent('close', { wasClean: false, code, reason }));
  }

  private logEvent(type: WebSocketEventType, data?: unknown) {
    this.eventLog.push({ type, data });
  }
}
