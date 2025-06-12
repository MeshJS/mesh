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

  async send(data: unknown) {
    if (!this._websocket || this._websocket.readyState !== WebSocket.OPEN) {
      if (this._status === "CONNECTING") {
        try {
          await new Promise<void>((resolve, reject) => {
            const checkConnection = setInterval(() => {
              if (this._websocket?.readyState === WebSocket.OPEN) {
                clearInterval(checkConnection);
                resolve();
              } else if (this._websocket?.readyState === WebSocket.CLOSED || this._websocket?.readyState === WebSocket.CLOSING) {
                clearInterval(checkConnection);
                reject(new Error("WebSocket is closed or closing"));
              }
            }, 100); 
          });
        } catch (error) {
          console.error("Error waiting for WebSocket to open:", error);
        }
      }; 
    }
    if(!this._websocket){
      throw new Error("Websocket undefined");
    }
    try {
      this._websocket.send(JSON.stringify(data));
    } catch (error) {
      console.error("Error sending data:", error);
      throw error;
    }
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
