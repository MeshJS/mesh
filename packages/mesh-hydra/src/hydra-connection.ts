import { EventEmitter } from "events";
import { hStatus } from "./types/hStatus";
import WebSocket from "isomorphic-ws"

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

  async connect() {
    if (this._status !== "IDLE") {
      return;
    }

    this._websocket = new WebSocket(this._websocketUrl);
    this._status = "CONNECTING";

    this._websocket.onopen = () => {
      this._connected = true;
    };
    this._websocket.onerror = (error) => {
      console.error(`Hydra error: ${error}`);
    };
    this._websocket.onclose = (code) => {
      console.error("Hydra websocket closed", code);
    };
    this._websocket.onmessage = (data) => {
      const message = JSON.parse(data.data as string);
      this._eventEmitter.emit("onmessage", message);
      this.processStatus(message);
    };
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

  send(data: unknown): void {
    if (this._connected) {
      this._websocket?.send(JSON.stringify(data));
    }
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
