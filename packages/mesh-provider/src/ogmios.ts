import {
  Action,
  IEvaluator,
  isNetwork,
  ISubmitter,
  Network,
  SUPPORTED_OGMIOS_LINKS,
  UTxO,
} from "@meshsdk/common";
import { getAdditionalUtxos } from "./utils";
import { BlockfrostProvider } from "./blockfrost";

export class OgmiosProvider implements IEvaluator, ISubmitter {
  private readonly _baseUrl: string;

  constructor(baseUrl: string);
  constructor(network: Network);

  constructor(...args: unknown[]) {
    this._baseUrl = isNetwork(args[0])
      ? SUPPORTED_OGMIOS_LINKS[args[0]]
      : (args[0] as string);
  }

  /**
   * Evaluates the resources required to execute the transaction
   * @param cbor - The transaction CBOR hex string to evaluate
   * @param additionalUtxos - Optional array of additional UTxOs to include in the evaluation context for resolving transaction inputs
   * @param additionalTxs - Optional array of transaction CBOR hex strings to provide additional UTxOs from their outputs
   */
  async evaluateTx(cbor: string, additionalUtxos?: UTxO[], additionalTxs?: string[]): Promise<Omit<Action, "data">[]> {
    // Use BlockfrostProvider for fetching additional UTxOs at this moment (as ogmios doesn't implement IFetcher)
    const blockfrostProvider = new BlockfrostProvider("apikey");
    const additionalUtxo = await getAdditionalUtxos(blockfrostProvider, "ogmios", additionalUtxos, additionalTxs);

    const client = await this.open();

    this.send(client, "evaluateTransaction", {
      transaction: {
        cbor,
      },
      additionalUtxo
    });

    return new Promise((resolve, reject) => {
      client.addEventListener(
        "message",
        (response: MessageEvent<string>) => {
          try {
            const { result } = JSON.parse(response.data);
            if (result) {
              resolve(
                Object.values(result).map((val: any) => {
                  return <Omit<Action, "data">>{
                    index: val.validator.index,
                    tag: val.validator.purpose.toUpperCase(),
                    budget: {
                      mem: val.budget.memory,
                      steps: val.budget.cpu,
                    },
                  };
                }),
              );
            } else {
              reject(result);
            }

            client.close();
          } catch (error) {
            reject(error);
          }
        },
        { once: true },
      );
    });
  }

  async onNextTx(callback: (tx: unknown) => void): Promise<() => void> {
    const client = await this.open();

    this.send(client, "acquireMempool", {});

    client.addEventListener("message", (response: MessageEvent<string>) => {
      const { result } = JSON.parse(response.data);
      if (result === null) {
        return this.send(client, "acquireMempool", {});
      }

      if (result.transaction === null || result.transaction === undefined) {
        this.send(client, "acquireMempool", {});
      } else {
        callback(result);
      }

      this.send(client, "nextTransaction", {
        fields: "all",
      });
    });

    return () => client.close();
  }

  /**
   * Submit a serialized transaction to the network.
   * @param tx - The serialized transaction in hex to submit
   * @returns The transaction hash of the submitted transaction
   */
  async submitTx(tx: string): Promise<string> {
    const client = await this.open();

    this.send(client, "submitTransaction", {
      transaction: {
        cbor: tx,
      },
    });

    return new Promise((resolve, reject) => {
      client.addEventListener(
        "message",
        (response: MessageEvent<string>) => {
          try {
            const { result } = JSON.parse(response.data);

            if (!result) {
              reject(JSON.parse(response.data).error);
            }

            if (
              result.transaction !== null &&
              result.transaction !== undefined
            ) {
              resolve(result.transaction.id);
            } else {
              reject(result);
            }

            client.close();
          } catch (error) {
            reject(error);
          }
        },
        { once: true },
      );
    });
  }

  async fetchProtocolParameters(): Promise<any> {
    const client = await this.open();

    this.send(client, "queryLedgerState/protocolParameters", {});
    return new Promise((resolve, reject) => {
      client.addEventListener(
        "message",
        (response: MessageEvent<string>) => {
          try {
            const { result } = JSON.parse(response.data);

            if (!result) {
              reject(JSON.parse(response.data).error);
            }

            resolve(result);

            client.close();
          } catch (error) {
            reject(error);
          }
        },
        { once: true },
      );
    });
  }

  private async open(): Promise<WebSocket> {
    const client = new WebSocket(this._baseUrl);

    await new Promise((resolve) => {
      client.addEventListener("open", () => resolve(true), { once: true });
    });

    return client;
  }

  private send(client: WebSocket, method: string, params: unknown) {
    client.send(
      JSON.stringify({
        jsonrpc: "2.0",
        type: "jsonwsp/request",
        servicename: "ogmios",
        method,
        params,
      }),
    );
  }
}
