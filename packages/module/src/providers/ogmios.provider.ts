import { IEvaluator, ISubmitter } from '@mesh/common/contracts';

export class OgmiosProvider implements IEvaluator, ISubmitter {
  constructor(
    private readonly _ogmiosURL = 'wss://ogmios-api.mainnet.dandelion.link',
  ) {}

  async onNextTx(callback: (tx: unknown) => void): Promise<() => void> {
    const client = await this.open();
    
    this.send(client, 'AwaitAcquire', {});

    client.addEventListener('message', (response: MessageEvent<string>) => {
      const { result } = JSON.parse(response.data);

      if (result === null) {
        return this.send(client, 'AwaitAcquire', {});
      }
      
      if (result.AwaitAcquired === undefined) {
        callback(result);
      }

      this.send(client, 'NextTx', {});
    });

    return () => client.close();
  }

  async evaluateTx(tx: string): Promise<object> {
    const client = await this.open();
    
    this.send(client, 'EvaluateTx', {
      evaluate: tx,
    });

    return new Promise((resolve, reject) => {
      client.addEventListener('message', (response: MessageEvent<string>) => {
        try {
          const { result } = JSON.parse(response.data);
          console.log({result})

          if (result.EvaluationResult) {
            resolve(result.EvaluationResult);
          }
          else {
            reject(result.EvaluationFailure);
          }

          client.close();
        } catch (error) {
          reject(error);
        }
      }, { once: true });
    });
  }

  async submitTx(tx: string): Promise<string> {
    const client = await this.open();
    
    this.send(client, 'SubmitTx', {
      submit: tx,
    });

    return new Promise((resolve, reject) => {
      client.addEventListener('message', (response: MessageEvent<string>) => {
        try {
          const { result } = JSON.parse(response.data);

          if (result.SubmitSuccess) {
            resolve(result.SubmitSuccess.txId);
          }
          else {
            reject(result.SubmitFail);
          }

          client.close();
        } catch (error) {
          reject(error);
        }
      }, { once: true });
    });
  }

  private async open(): Promise<WebSocket> {
    const client = new WebSocket(this._ogmiosURL);

    await new Promise((resolve) => {
      client.addEventListener('open', () => resolve(true), { once: true });
    });

    return client;
  }

  private send(client: WebSocket, methodname: string, args: unknown) {
    client.send(
      JSON.stringify({
        version: '1.0',
        type: 'jsonwsp/request',
        servicename: 'ogmios',
        methodname, args,
      })
    );
  }
}
