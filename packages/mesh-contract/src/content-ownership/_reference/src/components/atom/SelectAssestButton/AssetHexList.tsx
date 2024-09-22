import { addAsset, updateAsset } from "@/redux/actions/asset";
import { RootReducer } from "@/redux/rootReducer";
import { AppDispatch } from "@/redux/store";
import { AssetExtended, Wallet } from "@meshsdk/core";
import { useWallet } from "@meshsdk/react";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

function AssetHexList({ callback }: { callback: VoidFunction }) {
  const { wallet, connected } = useWallet();
  const [asset, setAsset] = useState<AssetExtended[]>();
  const dispatch: AppDispatch = useDispatch();
  const assestHex = useSelector((state: RootReducer) => state.asset);
  const assetList = useSelector((state: RootReducer) => state.assetsList);

  const [selected, setSelected] = useState<boolean>(false);
  useEffect(() => {
    setAsset(assetList[0]);
  }, [connected]);

  return (
    connected &&
    asset &&
    !selected && (
      <>
        {asset.map((asset) => (
          <button
            key={asset.unit}
            className=" text-black py-1  text-start"
            onClick={() => {
              /**Set the assest Hex to reducer */
              assestHex.length > 0
                ? dispatch(updateAsset(asset))
                : dispatch(addAsset(asset));
              setSelected(true);
              callback();
            }}
          >
            {asset.unit}
          </button>
        ))}
      </>
    )
  );
}

export default AssetHexList;
