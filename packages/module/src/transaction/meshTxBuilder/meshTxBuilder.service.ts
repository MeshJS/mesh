import { IFetcher } from '@mesh/common/contracts';

export class MeshTxBuilder {
  private _fetcher?: IFetcher;
  constructor(fetcher?: IFetcher) {
    if (fetcher) this._fetcher = fetcher;
  }
}
