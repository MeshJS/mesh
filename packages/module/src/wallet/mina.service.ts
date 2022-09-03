import axios, { AxiosInstance } from 'axios';
const minaFrontendUrl = 'http://localhost:3001/';
const minaBackendUrl = 'http://localhost:5000/';
import type { Asset, AssetExtended, UTxO, Wallet } from '@mesh/common/types';

export class MinaWallet {
  private readonly instance: AxiosInstance;

  private constructor() {
    this.instance = axios.create({
      baseURL: minaBackendUrl,
      withCredentials: true,
    });
  }

  async enable(social?: string) {
    try {
      const wallets = await this.instance.get('wallet/getUserWalletsMeta');
      console.log('wallets', wallets);
      return true;
    } catch (error) {
      console.log('no session, do login', social);
      const afterLoginUrl = `${minaFrontendUrl}loginsuccess`;
      const windowFeatures = 'left=100,top=100,width=320,height=320';
      const handle = window.open(
        `${minaBackendUrl}auth/discordlogin?redirect=${afterLoginUrl}`,
        'meshWindow',
        windowFeatures
      );
      if (!handle) {
        console.error('the window did not open', handle);
      }
      return await (async () => {
        return new Promise((res) => {
          window.addEventListener('message', async (e) => {
            if (e.data.target == 'minaWalletLogin') {
              console.log('MinaWalletLogin message', e.data);
              res(e.data.data);
            }
          });
        });
      })();
    }
  }

  async getChangeAddress(): Promise<string | undefined> {
    try {
      const changeAddress = await this.instance.get('wallet/getChangeAddress');
      return changeAddress.data;
    } catch (error) {
      console.error('Not logged in');
      return undefined;
    }
  }

  async getUtxos(): Promise<UTxO[]> {
    return [];
  }

  async signTx(unsignedTx: string, partialSign = false): Promise<string> {
    return '';
  }
}
