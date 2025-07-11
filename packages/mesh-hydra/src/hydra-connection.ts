import { EventEmitter } from "events";
import { hStatus } from "./types/hStatus";
import WebSocket, { MessageEvent } from "isomorphic-ws";

export class HydraConnection extends EventEmitter {
  constructor({
    url,
    eventEmitter,
    history = false,
    address,
    wsUrl,
  }: {
    url: string;
    eventEmitter: EventEmitter;
    history?: boolean;
    address?: string;
    wsUrl?: string;
  }) {
    super();
    const _wsUrl = wsUrl ? wsUrl : url.replace("http", "ws");
    const _history = `history=${history ? "yes" : "no"}`;
    const _address = address ? `&address=${address}` : "";
    this._websocketUrl = `${_wsUrl}/?${_history}${_address}`;
    this._eventEmitter = eventEmitter;
  }

  async connect(): Promise<void> {
    this._websocket = new WebSocket(this._websocketUrl);
    if (!this._websocket) {
      throw new Error("invalid url, websocket failed to connect");
    }
    this._status = "CONNECTING";

    this._websocket.onopen = () => {
      this._connected = true;
      this._status = "CONNECTED";
      console.log("WebSocket connected successfully");
    };

    this._websocket.onerror = (error) => {
      console.error("Hydra error:", error);
      this._connected = false;
    };

    this._websocket.onclose = (code) => {
      console.error("Hydra websocket closed", code.code, code.reason);
      this._status = "CLOSED";
      this._connected = false;
    };

    this._websocket.onmessage = (data: MessageEvent) => {
      const message = JSON.parse(data.data as string);
      console.log("Received message from Hydra:", message);
      this._eventEmitter.emit("onmessage", message);
      this.processStatus(message);
    };
  }

  send(data: unknown): void {
    const sendData = () => {
      if (this._websocket?.readyState === WebSocket.OPEN) {
        this._websocket.send(JSON.stringify(data));
        return true;
      }
      return false;
    };

    const interval = setInterval(() => {
      if (sendData()) {
        clearInterval(interval);
      }
    }, 1000);

    setTimeout(() => {
      if (!sendData()) {
        console.error("Failed to send data: WebSocket connection timeout.");
        clearInterval(interval);
      }
    }, 5000);
  }

  async disconnect() {
    if (this._status === "IDLE") {
      return;
    }
    if (this._websocket && this._websocket.readyState === WebSocket.OPEN) {
      this._websocket.close(1007);
    }
    this._status = "IDLE";
  }

  async processStatus(message: {}) {
    let status: hStatus | null = null;
    if ((status = hStatus(message)) && status !== null) {
      this._status = status;
      this._eventEmitter.emit("onstatuschange", status);
    }
  }

  _websocket: WebSocket | undefined;
  _status: hStatus = "IDLE";
  _websocketUrl: string;
  private readonly _eventEmitter: EventEmitter;
  private _connected: boolean = false;
}
