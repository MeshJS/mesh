import { useEffect, useState } from "react";
import type { NextPage } from "next";
import Mesh from "@martifylabs/mesh";
import { Button, Codeblock, Metatags } from "../../components";

const Blockfrost: NextPage = () => {
  const [blockfrostLoaded, setBlockfrostLoaded] = useState<boolean>(false);
  const [response, setResponse] = useState<null | any>(null);
  const [selectedApi, setSelectedApi] = useState<string | null>(null);
  const [address, setAddress] = useState(
    "addr_test1qqwk2r75gu5e56zawmdp2pk8x74l5waandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgsxv2vff"
  );
  const [assetId, setAssetId] = useState(
    "ab8a25c96cb18e174d2522ada5f7c7d629724a50f9c200c12569b4e25069786f73"
  );

  useEffect(() => {
    async function loadBlockfrost() {
      await Mesh.blockfrost.init({
        blockfrostApiKey: process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY!,
        network: 0,
      });
      setBlockfrostLoaded(true);
    }
    loadBlockfrost();
  }, []);

  async function addressesAddressUtxos() {
    const res = await Mesh.blockfrost.addressesAddressUtxos({
      address:
        "addr_test1qqwk2r75gu5e56zawmdp2pk8x74l5waandqaw7d0t5ag9us9kqxxhxdp82mrwmfud2rffkk87ufxh25qu08xj5z6qlgsxv2vff",
    });
    setResponse(res);
    setSelectedApi("addressesAddressUtxos");
  }

  async function assetSpecificAsset() {
    const res = await Mesh.blockfrost.assetSpecificAsset({
      asset:
        "ab8a25c96cb18e174d2522ada5f7c7d629724a50f9c200c12569b4e25069786f73",
    });
    setResponse(res);
    setSelectedApi("assetSpecificAsset");
  }

  async function blockLatestBlock() {
    const res = await Mesh.blockfrost.blockLatestBlock();
    setResponse(res);
    setSelectedApi("blockLatestBlock");
  }

  async function epochsLatestEpochProtocolParameters() {
    const res = await Mesh.blockfrost.epochsLatestEpochProtocolParameters();
    setResponse(res);
    setSelectedApi("epochsLatestEpochProtocolParameters");
  }

  return (
    <div className="mt-32 prose prose-slate mx-auto lg:prose-lg">
      <Metatags title="Blockfrost APIs" />
      <h1>Blockfrost APIs</h1>
      <p className="lead">
        Here we call some <a href="https://blockfrost.io/">Blockfrost</a> APIs,
        accessing information stored on the blockchain.
      </p>
      {blockfrostLoaded && (
        <>
          <div className="m-2 p-2 bg-white shadow rounded w-full">
            <div className="flex justify-between items-center">
              <input
                className="w-full bg-gray-100 rounded p-2 border focus:outline-none focus:border-blue-500"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                type="text"
                placeholder="address"
              />
              <div className="flex justify-center items-center space-x-2">
                <Button
                  onClick={() => addressesAddressUtxos()}
                  style={
                    selectedApi == "addressesAddressUtxos"
                      ? "success"
                      : "primary"
                  }
                >
                  addressesAddressUtxos
                </Button>
              </div>
            </div>
          </div>

          <div className="m-2 p-2 bg-white shadow rounded w-full">
            <div className="flex justify-between items-center">
              <input
                className="w-full bg-gray-100 rounded p-2 border focus:outline-none focus:border-blue-500"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                type="text"
                placeholder="asset ID"
              />
              <div className="flex justify-center items-center space-x-2">
                <Button
                  onClick={() => assetSpecificAsset()}
                  style={
                    selectedApi == "assetSpecificAsset" ? "success" : "primary"
                  }
                >
                  assetSpecificAsset
                </Button>
              </div>
            </div>
          </div>

          <Button
            onClick={() => blockLatestBlock()}
            style={selectedApi == "blockLatestBlock" ? "success" : "primary"}
          >
            blockLatestBlock
          </Button>

          <Button
            onClick={() => epochsLatestEpochProtocolParameters()}
            style={
              selectedApi == "epochsLatestEpochProtocolParameters"
                ? "success"
                : "primary"
            }
          >
            epochsLatestEpochProtocolParameters
          </Button>

          {response !== null && (
            <>
              <h4>Response</h4>
              <Codeblock data={response} />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Blockfrost;
