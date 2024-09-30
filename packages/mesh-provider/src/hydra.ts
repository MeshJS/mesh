import { EventEmitter } from "events";
import axios, { AxiosInstance } from "axios";

import { UTxO } from "@meshsdk/common";

import { HydraUTxO } from "./types/hydra";
import { parseHttpError } from "./utils";

export class HydraProvider {
  private readonly _baseUrl: string;
  private readonly _eventEmitter: EventEmitter;
  private _client: WebSocket | undefined;
  private readonly _axiosInstance: AxiosInstance;

  constructor(url: string) {
    this._baseUrl = url;
    this._eventEmitter = new EventEmitter();

    this._axiosInstance = axios.create({ baseURL: url });
  }

  async connect(): Promise<void> {
    const _client = new WebSocket(this._baseUrl);

    await new Promise((resolve) => {
      _client.addEventListener("open", () => resolve(true), { once: true });
    });

    _client.onopen = () => {
      console.log("Connected to Hydra");
    };
    _client.onerror = (error) => {
      console.error("Error on Hydra websocket: ", error);
    };
    _client.onclose = () => {
      console.error("Hydra websocket closed");
    };
    _client.onmessage = this.receiveMessage.bind(this);

    this._client = _client;
  }

  check() {
    if (this._client === undefined) {
      throw new Error("HydraProvider not connected. Do connect() first.");
    }
  }

  /**
   * Initializes a new Head. This command is a no-op when a Head is already open and the server will output an CommandFailed message should this happen.
   */
  async initializesHead() {
    this.check();
    this.sendCommand({ tag: "Init" });
  }

  async fetchAddressUTxOs(address: string): Promise<UTxO[]> {
    const { data, status } = await this._axiosInstance.get(`snapshot/utxo`);
    if (status === 200) {
      const utxos = data.map((utxo: HydraUTxO) =>
        this.toUTxO(utxo, utxo.tx_hash),
      );
      return utxos;
    }
    throw parseHttpError(data);
  }

  async receiveMessage(message: MessageEvent) {
    const data = JSON.parse(message.data);
    this._eventEmitter.emit("hydraMessage", data);
  }

  onMessage(callback: (message: unknown) => void) {
    this._eventEmitter.on("hydraMessage", callback);
  }

  private sendCommand(data: {}) {
    this._client!.send(JSON.stringify(data));
  }

  private toUTxO = async (
    hUTxO: HydraUTxO,
    tx_hash: string,
  ): Promise<UTxO> => ({
    input: {
      outputIndex: hUTxO.output_index,
      txHash: tx_hash,
    },
    output: {
      address: hUTxO.address,
      amount: hUTxO.amount,
      dataHash: hUTxO.data_hash ?? undefined,
      plutusData: hUTxO.inline_datum ?? undefined,
      scriptHash: hUTxO.reference_script_hash,
    },
  });
}
