import Header from "@/components/organism/Header/Header";
import Head from "next/head";
import Image from "next/image";

import { useDispatch, useSelector } from "react-redux";

import { AppDispatch } from "@/redux/store";
import { useEffect } from "react";
import { useWallet } from "@meshsdk/react";
import { RootReducer } from "@/redux/rootReducer";
import PostTable from "@/components/organism/PostTable/PostTable";
import TransferContentButton from "@/components/organism/TransferContentButton/TransferContentButton";
import { addWalletAddress, updateWalletAddress } from "@/redux/actions/walletAddress";
import { addFeeUtxo, updateFeeUtxo } from "@/redux/actions/feeUtxo";
import { addCollateralUtxo, updateCollateralUtxo } from "@/redux/actions/collateralUtxo";
import { addAssetsList, updateAssetsList } from "@/redux/actions/assetsList";

export default function Home() {
  const { connected, wallet } = useWallet();
  const dispatch: AppDispatch = useDispatch();
  const walletAddress = useSelector((state: RootReducer) => state.walletAddress);
  const feeUtxo = useSelector((state: RootReducer) => state.feeUtxo);
  const collateralUtxo = useSelector((state: RootReducer) => state.collateralUtxo);
  const assetsList = useSelector((state: RootReducer) => state.assetsList);

  const savingWalletData = async () => {
    try {
      // walletAddress: first item in used address, if no used address, use first item in unused address
      const address = await wallet.getUsedAddresses();
      // Get fee UTxO: select an UTxO with >5,000,000 lovelace
      const utxos = await wallet.getUtxos();
      const collateral = await wallet.getCollateral();
      const asset = await wallet.getAssets();

      /**Saving walletAddress */
      console.log("walletAddress:", address[0]);
      dispatch(walletAddress.length > 0 ? updateWalletAddress(address[0]) : addWalletAddress(address[0]));

      /**Saving feeUtxo */
      console.log("feeUtxo:", utxos[0]);
      dispatch(feeUtxo.length > 0 ? updateFeeUtxo(utxos[0]) : addFeeUtxo(utxos[0]));

      /**Saving collateralUtxo */
      console.log("collateralUtxo:", collateral[0]);
      dispatch(collateralUtxo.length > 0 ? updateCollateralUtxo(collateral[0]) : addCollateralUtxo(collateral[0]));

      /**Saving asset */
      console.log("assetList:", asset);
      dispatch(assetsList.length > 0 ? updateAssetsList(asset) : addAssetsList(asset));
    } catch (error) {}
  };

  useEffect(() => {
    savingWalletData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  return (
    <div className=" max-w-7xl">
      <Head>
        <title>Content-Ownership-demo</title>
        <link rel="icon" href="/favicon.ico"></link>
      </Head>

      <Header />

      <div className="flex justify-between items-center bg-yellow-400 border-white border-y py-10 lg:py-0">
        <div className="text-black px-10 space-y-5">
          <h1 className="text-6xl max-w-xl font-serif ">
            <span className="underline decoration-black decoration-4">Medium</span> is a place to write, read and
            connect
          </h1>
          <h2>It&apos;s easy and free to post your thinking on any topic and connect with millions of readers</h2>
        </div>

        <Image
          className="hidden md:inline-flex h-32 lg:h-full"
          src="https://accountabilitylab.org/wp-content/uploads/2020/03/Medium-logo.png"
          width={0}
          height={0}
          sizes="100vw"
          style={{ width: "auto", height: "auto" }}
          alt="medium logo"
        />
      </div>
      {/**Transfer Content button */}
      {connected && <TransferContentButton />}
      {/**Post component */}
      <PostTable />
    </div>
  );
}
