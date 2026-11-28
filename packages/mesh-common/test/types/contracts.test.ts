import {
  awaitTransactionConfirmation,
  AwaitTxOptions,
  BlockInfo,
  Cip30WalletApi,
  EvaluationContext,
  IFetcher,
  IListener,
  ISigner,
  Network,
  networkConfig,
  SLOT_CONFIG_NETWORK,
  TransactionInfo,
} from "@meshsdk/common";

// These cases are checked by the compiler; the functions are never called.

declare const fetcher: IFetcher;
declare const block: BlockInfo;
declare const tx: TransactionInfo;

const fetcherContracts = () => {
  const {
    network: _network,
    fetchLatestBlock: _fetchLatestBlock,
    ...withoutNew
  } = fetcher;
  const plain: IFetcher = withoutNew;
  const withNetwork: IFetcher = {
    ...fetcher,
    network: "preprod",
    fetchLatestBlock: async () => block,
  };
  // @ts-expect-error the network is a name
  const numbered: IFetcher = { ...fetcher, network: 1 };

  class PublicNetwork {
    constructor(readonly network?: Network) {}
  }
  class PrivateNetwork {
    constructor(private network?: Network) {}
  }
  const publicOne: Pick<IFetcher, "network"> = new PublicNetwork("preprod");
  // @ts-expect-error a private member named network does not fit
  const privateOne: Pick<IFetcher, "network"> = new PrivateNetwork("preprod");
  return [plain, withNetwork, numbered, publicOne, privateOne];
};

const typeContracts = () => {
  const withHeight: BlockInfo = { ...block, height: 10 };
  const { height: _height, ...withoutHeight } = withHeight;
  const blockWithout: BlockInfo = withoutHeight;
  const withValidity: TransactionInfo = { ...tx, validContract: false };
  const { validContract: _valid, ...withoutValidity } = withValidity;
  const txWithout: TransactionInfo = withoutValidity;
  const context: EvaluationContext = {
    network: "preview",
    slotConfig: SLOT_CONFIG_NETWORK.preview,
  };
  const contextWithout: EvaluationContext = { network: "preview" };

  const keys: readonly string[] = ["ab"];
  const signer: ISigner = {
    signData: async () => ({ signature: "", key: "" }),
    signTx: async (t) => t,
    signTxs: async (t) => t,
    signTxWitnesses: async (_tx, _keyHashes?: readonly string[]) => "a0",
  };
  void signer.signTxWitnesses?.("84a0", keys);
  const signerWithout: ISigner = {
    signData: async () => ({ signature: "", key: "" }),
    signTx: async (t) => t,
    signTxs: async (t) => t,
  };

  const listener: IListener = {
    onTxConfirmed: () => {},
    awaitTransactionConfirmation: async () => true,
  };
  const listenerWithout: IListener = { onTxConfirmed: () => {} };
  return [
    blockWithout,
    txWithout,
    context,
    contextWithout,
    signerWithout,
    listener,
    listenerWithout,
  ];
};

const walletContracts = () => {
  const required = {
    getNetworkId: async () => 0,
    getChangeAddress: async () => "00",
    getUtxos: async () => ["82"],
    signTx: async (_tx: string, _partialSign?: boolean) => "a0",
  };
  const minimal: Cip30WalletApi = required;
  const submitter: Cip30WalletApi = {
    ...required,
    submitTx: async () => "ab",
  };
  const collateral: Cip30WalletApi = {
    ...required,
    getCollateral: async ({ amount: _amount }) => ["82"],
  };
  const experimental: Cip30WalletApi = {
    ...required,
    experimental: { getCollateral: async () => undefined },
  };
  const empty: Cip30WalletApi = { ...required, getUtxos: async () => null };
  const { signTx: _signTx, ...unsigned } = required;
  // @ts-expect-error signTx is required
  const noSign: Cip30WalletApi = unsigned;
  return [minimal, submitter, collateral, experimental, empty, noSign];
};

const optionContracts = () => {
  // @ts-expect-error the poll option is pollMs
  const old: AwaitTxOptions = { intervalMs: 1 };
  const options: AwaitTxOptions = { timeoutMs: 1, pollMs: 1 };
  // @ts-expect-error testnet has no slot clock
  networkConfig("testnet");
  void awaitTransactionConfirmation(
    // @ts-expect-error a submitter alone cannot be waited with
    { submitTx: async (t: string) => t },
    "ab",
  );
  return [old, options];
};

describe("Type contracts", () => {
  it("are checked by the compiler", () => {
    expect([
      fetcherContracts,
      typeContracts,
      walletContracts,
      optionContracts,
    ]).toHaveLength(4);
  });
});
