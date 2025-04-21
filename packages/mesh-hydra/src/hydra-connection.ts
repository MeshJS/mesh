import { EventEmitter } from "events";
import { hStatus } from "./types/hStatus";

export class HydraConnection extends EventEmitter {
  _websocket: WebSocket | undefined;
  _status: hStatus = "IDLE";
  _websocketUrl: string;
  private readonly _eventEmitter: EventEmitter;
  private _connected: boolean = false;

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

  send(data: any): void {
    if (this._connected) {
      this._websocket?.send(JSON.stringify(data));
    }
  }

  async processStatus(message: {}) {
    function getStatus(data: any): hStatus | null {
      switch (data.headStatus) {
        case "Open":
          return "OPEN";
      }

      switch (data.tag) {
        case "HeadIsInitializing":
          return "INITIALIZING";
        case "HeadIsOpen":
          return "OPEN";
        case "HeadIsClosed":
          return "CLOSED";
        case "ReadyToFanout":
          return "FANOUT_POSSIBLE";
        case "HeadIsFinalized":
          return "FINAL";
        default:
          return null;
      }
    }

    let status: hStatus | null = null;
    if ((status = getStatus(message)) && status !== null) {
      this._status = status;
      this._eventEmitter.emit("onstatuschange", status);
    }
  }
}
