type WebSocketEventType = 'open' | 'message' | 'close' | 'error';

export class MockWebSocket {
  public readyState: number = WebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  public sentMessages: unknown[] = [];
  public eventLog: { type: WebSocketEventType; data?: unknown }[] = [];

  // Mocked methods
  send = jest.fn();
  close = jest.fn();

  constructor(public url: string) {
    this.send.mockImplementation((data: unknown) => {
      if (this.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket is not open');
      }
      this.logEvent('message', data);
      this.sentMessages.push(data);
    });

    this.close.mockImplementation((code = 1000, reason = 'Normal closure') => {
      if (this.readyState === WebSocket.CLOSED) return;
      this.readyState = WebSocket.CLOSED;
      const event = new CloseEvent('close', { wasClean: true, code, reason });
      this.logEvent('close', { code, reason });
      this.onclose?.(event);
    });

    // Defer opening to allow event listeners to be attached
    process.nextTick(() => {
      this.readyState = WebSocket.OPEN;
      this.logEvent('open');
      this.onopen?.(new Event('open'));
    });
  }

  // Test hooks
  mockReceive(data: string | ArrayBuffer | Blob | Uint8Array) {
    process.nextTick(() => {
      this.logEvent('message', data);
      this.onmessage?.(new MessageEvent('message', { data }));
    });
  }

  mockBinaryReceive(binary: ArrayBuffer | Uint8Array | Blob) {
    this.mockReceive(binary);
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
