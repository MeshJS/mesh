import { useState } from 'react';
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

export default function Fetcher({ fetcher, fetcherName }) {
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
    </>
  );
}
