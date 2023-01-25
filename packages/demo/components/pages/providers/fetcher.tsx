import { useEffect, useState } from 'react';
import SectionTwoCol from '../../common/sectionTwoCol';
import { demoAddresses } from '../../../configs/demo';
import { BadgeFetcher } from './badges';
import {
  fetchAssetAddressesLeft,
  fetchAssetAddressesRight,
} from './fetchers/fetchAssetAddresses';
import {
  fetchAddressUtxosLeft,
  fetchAddressUtxosRight,
} from './fetchers/fetchAddressUtxos';
import {
  fetchAssetMetadataLeft,
  fetchAssetMetadataRight,
} from './fetchers/fetchAssetMetadata';
import {
  fetchProtocolParametersLeft,
  fetchProtocolParametersRight,
} from './fetchers/fetchProtocolParameters';
import {
  fetchAccountInfoLeft,
  fetchAccountInfoRight,
} from './fetchers/fetchAccountInfo';
import {
  fetchHandleAddressLeft,
  fetchHandleAddressRight,
} from './fetchers/fetchHandleAddress';
import { useWallet } from '@meshsdk/react';
import { fetchTxInfoLeft, fetchTxInfoRight } from './fetchers/fetchTxInfo';
import {
  fetchBlockInfoLeft,
  fetchBlockInfoRight,
} from './fetchers/fetchBlockInfo';

export default function Fetcher({ fetcher, fetcherName }) {
  const { wallet, connected } = useWallet();

  const [fetchAddressUtxosAddress, setfetchAddressUtxosAddress] =
    useState<string>(demoAddresses.testnet);
  const [fetchAddressUtxosAsset, setfetchAddressUtxosAsset] = useState<string>(
    'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e'
  );
  const [fetchAssetMetadataAsset, setfetchAssetMetadataAsset] =
    useState<string>(
      'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e'
    );
  const [fetchAssetAddressesAsset, setfetchAssetAddressesAsset] =
    useState<string>(
      'd9312da562da182b02322fd8acb536f37eb9d29fba7c49dc172555274d657368546f6b656e'
    );
  const [fetchProtocolParameters, setfetchProtocolParameters] =
    useState<string>('10');
  const [fetchAccountInfoAddress, setFetchAccountInfoAddress] =
    useState<string>(
      'stake_test1uzx0ksy9f4qnj2mzfdncqyjy84sszh64w43853nug5pedjgytgke9'
    );

  const [fetchHandleAddressHandle, setfetchHandleAddressHandle] =
    useState<string>('jingles');

  const [txHash, setTxHash] = useState<string>(
    'f4ec9833a3bf95403d395f699bc564938f3419537e7fb5084425d3838a4b6159'
  );
  const [block, setBlock] = useState<string>(
    '79f60880b097ec7dabb81f75f0b52fedf5e922d4f779a11c0c432dcf22c56089'
  );

  // useEffect(() => {
  //   async function init() {
  //     setTxHash(
  //       (await wallet.getNetworkId()) === 1
  //         ? '84a1d1a9f8fb3e7b4f3d1bb04ece750fe2697e74b7916804c2f179870eb34f17'
  //         : 'f4ec9833a3bf95403d395f699bc564938f3419537e7fb5084425d3838a4b6159'
  //     );
  //   }
  //   if (connected) {
  //     init();
  //   }
  // }, [connected]);

  return (
    <>
      <SectionTwoCol
        sidebarTo="fetchAccountInfo"
        header="fetchAccountInfo"
        leftFn={fetchAccountInfoLeft({
          fetcherName,
          fetchAccountInfoAddress,
        })}
        rightFn={fetchAccountInfoRight({
          fetcher,
          fetchAccountInfoAddress,
          setFetchAccountInfoAddress,
        })}
        isH3={true}
        badge={<BadgeFetcher />}
      />

      <SectionTwoCol
        sidebarTo="fetchAddressUtxos"
        header="fetchAddressUtxos"
        leftFn={fetchAddressUtxosLeft({
          fetcherName,
          fetchAddressUtxosAddress,
          fetchAddressUtxosAsset,
        })}
        rightFn={fetchAddressUtxosRight({
          fetcher,
          fetchAddressUtxosAddress,
          setfetchAddressUtxosAddress,
          fetchAddressUtxosAsset,
          setfetchAddressUtxosAsset,
        })}
        isH3={true}
        badge={<BadgeFetcher />}
      />

      <SectionTwoCol
        sidebarTo="fetchAssetAddresses"
        header="fetchAssetAddresses"
        leftFn={fetchAssetAddressesLeft({
          fetcherName,
          fetchAssetAddressesAsset,
        })}
        rightFn={fetchAssetAddressesRight({
          fetcher,
          fetchAssetAddressesAsset,
          setfetchAssetAddressesAsset,
        })}
        isH3={true}
        badge={<BadgeFetcher />}
      />

      <SectionTwoCol
        sidebarTo="fetchAssetMetadata"
        header="fetchAssetMetadata"
        leftFn={fetchAssetMetadataLeft({
          fetcherName,
          fetchAssetMetadataAsset,
        })}
        rightFn={fetchAssetMetadataRight({
          fetcher,
          fetchAssetMetadataAsset,
          setfetchAssetMetadataAsset,
        })}
        isH3={true}
        badge={<BadgeFetcher />}
      />

      <SectionTwoCol
        sidebarTo="fetchBlockInfo"
        header="fetchBlockInfo"
        leftFn={fetchBlockInfoLeft({
          fetcherName,
          block,
        })}
        rightFn={fetchBlockInfoRight({
          fetcher,
          block,
          setBlock,
        })}
        isH3={true}
        badge={<BadgeFetcher />}
      />

      <SectionTwoCol
        sidebarTo="fetchHandleAddress"
        header="fetchHandleAddress"
        leftFn={fetchHandleAddressLeft({
          fetcherName,
          fetchHandleAddressHandle,
        })}
        rightFn={fetchHandleAddressRight({
          fetcher,
          fetchHandleAddressHandle,
          setfetchHandleAddressHandle,
        })}
        isH3={true}
        badge={<BadgeFetcher />}
      />
      <SectionTwoCol
        sidebarTo="fetchProtocolParameters"
        header="fetchProtocolParameters"
        leftFn={fetchProtocolParametersLeft({
          fetcherName,
          fetchProtocolParameters,
        })}
        rightFn={fetchProtocolParametersRight({
          fetcher,
          fetchProtocolParameters,
          setfetchProtocolParameters,
        })}
        isH3={true}
        badge={<BadgeFetcher />}
      />
      <SectionTwoCol
        sidebarTo="fetchTxInfo"
        header="fetchTxInfo"
        leftFn={fetchTxInfoLeft({
          fetcherName,
          txHash,
        })}
        rightFn={fetchTxInfoRight({
          fetcher,
          txHash,
          setTxHash,
        })}
        isH3={true}
        badge={<BadgeFetcher />}
      />
    </>
  );
}
