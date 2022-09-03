import axios, { AxiosInstance } from 'axios';
const minaFrontendUrl = 'http://localhost:3001/';
const minaBackendUrl = 'http://localhost:5000/';
import type { Asset, AssetExtended, UTxO } from '@mesh/common/types';

export class MinaWallet {
  static getAxiosInstance() {
    return axios.create({
      baseURL: minaBackendUrl,
      withCredentials: true,
    });
  }

  static async enable(social?: string) {
    try {
      const wallets = await this.getAxiosInstance().get(
        'wallet/getUserWalletsMeta'
      );
      console.log('wallets', wallets);
      return true;
    } catch (error) {
      console.log('no session, do login', social);
      // const afterLoginUrl = `${minaFrontendUrl}loginsuccess`;
      const windowFeatures = 'left=100,top=100,width=320,height=320';
      const handle = window.open(
        // `${minaBackendUrl}auth/discordlogin?redirect=${afterLoginUrl}`,
        `${minaFrontendUrl}login`,
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

  static async getChangeAddress(): Promise<string | undefined> {
    try {
      const changeAddress = await this.getAxiosInstance().get(
        'wallet/getChangeAddress'
      );
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
