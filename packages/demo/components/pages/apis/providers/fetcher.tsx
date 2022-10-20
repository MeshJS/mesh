import { useState } from 'react';
import Codeblock from '../../../ui/codeblock';
import Card from '../../../ui/card';
import SectionTwoCol from '../common/sectionTwoCol';
import RunDemoButton from '../common/runDemoButton';
import RunDemoResult from '../common/runDemoResult';
import Input from '../../../ui/input';
import { demoAddresses } from '../../../../configs/demo';
import { BadgeFetcher } from './badges';

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
  const [fetchProtocolParameters, setfetchProtocolParameters] =
    useState<string>('');

  return (
    <>
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
    </>
  );
}

function fetchAddressUtxosLeft({
  fetcherName,
  fetchAddressUtxosAddress,
  fetchAddressUtxosAsset,
}) {
  let code1 = `await ${fetcherName}.fetchAddressUTxOs(\n`;
  code1 += `  '${fetchAddressUtxosAddress}',\n`;
  if (fetchAddressUtxosAsset.length > 0) {
    code1 += `  '${fetchAddressUtxosAsset}',\n`;
  }
  code1 += `)`;
  return (
    <>
      <p>
        Fetch UTXOs in the provided <code>address</code>. Optionally, you can
        filter UTXOs containing a particular asset by providing{' '}
        <code>asset</code>, where it is the concatenation of policy ID and
        asset.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
function fetchAddressUtxosRight({
  fetcher,
  fetchAddressUtxosAddress,
  setfetchAddressUtxosAddress,
  fetchAddressUtxosAsset,
  setfetchAddressUtxosAsset,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchAddressUTxOs(
        fetchAddressUtxosAddress,
        fetchAddressUtxosAsset
      );
      setResponse(res);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }
  return (
    <>
      <Card>
        <Input
          value={fetchAddressUtxosAddress}
          onChange={(e) => setfetchAddressUtxosAddress(e.target.value)}
          placeholder="Address"
          label="Address"
        />
        <Input
          value={fetchAddressUtxosAsset}
          onChange={(e) => setfetchAddressUtxosAsset(e.target.value)}
          placeholder="Asset"
          label="Asset"
        />
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
        />
        <RunDemoResult response={response} />
        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}

function fetchAssetMetadataLeft({ fetcherName, fetchAssetMetadataAsset }) {
  let code1 = `await ${fetcherName}.fetchAssetMetadata(\n`;
  code1 += `  '${fetchAssetMetadataAsset}',\n`;
  code1 += `)`;
  return (
    <>
      <p>
        Fetch the asset metadata by providing <code>asset</code>, where it is
        the concatenation of policy ID and asset.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
function fetchAssetMetadataRight({
  fetcher,
  fetchAssetMetadataAsset,
  setfetchAssetMetadataAsset,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      const res = await fetcher.fetchAssetMetadata(fetchAssetMetadataAsset);
      setResponse(res);
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }
  return (
    <>
      <Card>
        <Input
          value={fetchAssetMetadataAsset}
          onChange={(e) => setfetchAssetMetadataAsset(e.target.value)}
          placeholder="Asset"
          label="Asset"
        />
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
        />
        <RunDemoResult response={response} />
        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}

function fetchProtocolParametersLeft({ fetcherName, fetchProtocolParameters }) {
  let code1 = `await ${fetcherName}.fetchProtocolParameters(`;
  if (fetchProtocolParameters.length > 0) {
    code1 += `${fetchProtocolParameters}`;
  }
  code1 += `)`;
  return (
    <>
      <p>
        Fetch the latest protocol parameters. Optionally, you can provide an
        epoch number to fetch the protocol parameters of that epoch.
      </p>
      <Codeblock data={code1} isJson={false} />
    </>
  );
}
function fetchProtocolParametersRight({
  fetcher,
  fetchProtocolParameters,
  setfetchProtocolParameters,
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [responseError, setResponseError] = useState<null | any>(null);
  async function runDemo() {
    setLoading(true);
    setResponse(null);
    setResponseError(null);
    try {
      if (fetchProtocolParameters.length > 0) {
        const res = await fetcher.fetchProtocolParameters(
          parseInt(fetchProtocolParameters)
        );
        setResponse(res);
      } else {
        const res = await fetcher.fetchProtocolParameters();
        setResponse(res);
      }
    } catch (error) {
      setResponseError(`${error}`);
    }
    setLoading(false);
  }
  return (
    <>
      <Card>
        <Input
          value={fetchProtocolParameters}
          onChange={(e) => setfetchProtocolParameters(e.target.value)}
          placeholder="Epoch"
          label="Epoch"
        />
        <RunDemoButton
          runDemoFn={runDemo}
          loading={loading}
          response={response}
        />
        <RunDemoResult response={response} />
        <RunDemoResult response={responseError} label="Error" />
      </Card>
    </>
  );
}
