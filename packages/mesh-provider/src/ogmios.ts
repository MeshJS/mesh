import {
  Action,
  IEvaluator,
  isNetwork,
  ISubmitter,
  Network,
  SUPPORTED_OGMIOS_LINKS,
} from "@meshsdk/common";

export class OgmiosProvider implements IEvaluator, ISubmitter {
  private readonly _baseUrl: string;

  constructor(baseUrl: string);
  constructor(network: Network);

  constructor(...args: unknown[]) {
    this._baseUrl = isNetwork(args[0])
      ? SUPPORTED_OGMIOS_LINKS[args[0]]
      : (args[0] as string);
  }

  async evaluateTx(tx: string): Promise<Omit<Action, "data">[]> {
    const client = await this.open();

    this.send(client, "evaluateTransaction", {
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
              reject(result.EvaluationFailure);
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

  async submitTx(tx: string): Promise<string> {
    const client = await this.open();

    this.send(client, "SubmitTx", {
      submit: tx,
    });

    return new Promise((resolve, reject) => {
      client.addEventListener(
        "message",
        (response: MessageEvent<string>) => {
          try {
            const { result } = JSON.parse(response.data);
            if (result.SubmitSuccess) {
              resolve(result.SubmitSuccess.txId);
            } else {
              reject(result.SubmitFail);
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
