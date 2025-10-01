import { EventEmitter } from "events";
import { hydraStatus } from "./types/hydraStatus";
import WebSocket, { MessageEvent } from "isomorphic-ws";

export class HydraConnection extends EventEmitter {
  constructor({
    httpUrl,
    eventEmitter,
    history = false,
    address,
    wsUrl,
  }: {
    httpUrl: string;
    eventEmitter: EventEmitter;
    history?: boolean;
    address?: string;
    wsUrl?: string;
  }) {
    super();
    const _wsUrl = wsUrl ? wsUrl : httpUrl.replace("http", "ws");
    const _history = `history=${history ? "yes" : "no"}`;
    const _address = address ? `&address=${address}` : "";
    this._websocketUrl = `${_wsUrl}/?${_history}${_address}`;
    this._eventEmitter = eventEmitter;
  }

  async connect(): Promise<void> {
    this._websocket = new WebSocket(this._websocketUrl);

    this._status = "CONNECTING";

    this._websocket.onopen = () => {
      this._connected = true;
      this._status = "CONNECTED";
      console.log("Hydra websocket connected");
    };

    this._websocket.onerror = (error) => {
      console.error("Hydra websocket error:", error);
      this._connected = false;
    };

    this._websocket.onclose = (code) => {
      console.error("Hydra websocket closed:", code.code, code.reason);
      this._status = "DISCONNECTED";
      this._connected = false;
    };

    this._websocket.onmessage = (data: MessageEvent) => {
      const message = JSON.parse(data.data as string);
      this._eventEmitter.emit("onmessage", message);
      this.processStatus(message);
    };
  }

  send(data: unknown): void {
    let send = false;

    const sendData = () => {
      if (this._websocket?.readyState === WebSocket.OPEN) {
        this._websocket.send(JSON.stringify(data));
        send = true;
        return true;
      }
      return false;
    };

    const interval = setInterval(() => {
      if (!send && sendData()) {
        clearInterval(interval);
        clearTimeout(timeout);
      }
    }, 1000);

    const timeout = setTimeout(() => {
      if (!send) {
        console.log(`Hydra websocket failed to send ${JSON.stringify(data)}`);
        clearInterval(interval);
      }
    }, 5000);
  }

  async disconnect(timeout?: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this._websocket) {
          this._websocket.onclose = (event: import("ws").CloseEvent) => {
            console.log("Hydra websocket disconnected:", event?.reason);
            this._connected = false;
            resolve();
          };
          this._websocket.close(1000, "initiated disconnect");
        } else {
          this._connected = false;
          resolve();
        }
      }, timeout);
    });
  }

  async processStatus(message: {}) {
    let status: hydraStatus | null = null;
    if ((status = hydraStatus(message)) && status !== null) {
      this._status = status;
      this._eventEmitter.emit("onstatuschange", status);
    }
  }

  _websocket: WebSocket | undefined;
  _status: hydraStatus = "IDLE";
  _websocketUrl: string;
  private readonly _eventEmitter: EventEmitter;
  private _connected: boolean = false;
}
