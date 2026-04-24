import { MeshPaymentSplitterContract } from "@meshsdk/contract";
import { IWallet, MeshTxBuilder } from "@meshsdk/core";

import { getProvider } from "../../../components/cardano/mesh-wallet";

export function getContract(wallet: IWallet) {
  const provider = getProvider();

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
  });

  const contract = new MeshPaymentSplitterContract(
    {
      mesh: meshTxBuilder,
      fetcher: provider,
      wallet: wallet,
      networkId: 0,
    },
    [
      "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
      "addr_test1vqqnfs2vt42nq4htq460wd6gjxaj05jg9vzg76ur6ws4sngs55pwr",
      "addr_test1vqv2qhqddxmf87pzky2nkd9wm4y5599mhp62mu4atuss5dgdja5pw",
    ],
  );

  return contract;
}

export default function Placeholder() {
  return <></>;
}
