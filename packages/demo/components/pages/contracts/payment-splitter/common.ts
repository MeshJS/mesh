import { MeshPaymentSplitterContract } from '@meshsdk/contracts';
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';

export function getContract(wallet) {
  const blockchainProvider = new BlockfrostProvider(
    process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD!
  );

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
  });

  const contract = new MeshPaymentSplitterContract(
    {
      mesh: meshTxBuilder,
      fetcher: blockchainProvider,
      wallet: wallet,
      networkId: 0,
    },
    [
      'addr_test1vpg334d6skwu6xxq0r4lqrnsjd5293n8s3d80em60kf6guc7afx8k',
      'addr_test1vp4l2kk0encl7t7972ngepgm0044fu8695prkgh5vjj5l6sxu0l3p',
      'addr_test1vqqnfs2vt42nq4htq460wd6gjxaj05jg9vzg76ur6ws4sngs55pwr',
      'addr_test1vqv2qhqddxmf87pzky2nkd9wm4y5599mhp62mu4atuss5dgdja5pw',
    ]
  );

  return contract;
}
