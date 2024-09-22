import React, { use, useEffect, useState } from "react";
import AssetHexList from "./AssetHexList";
import ConnectButton from "../../atom/ConnectButton/ConnectButton";
import { AppDispatch } from "@/redux/store";
import { useDispatch, useSelector } from "react-redux";
import { addAsset, updateAsset } from "@/redux/actions/asset";
import { useWallet } from "@meshsdk/react";
import { RootReducer } from "@/redux/rootReducer";
import { AssetExtended } from "@meshsdk/core";

function SelectAssetButton() {
  const [getAssets, setGetAssets] = useState(false);

  const asset = useSelector((state: RootReducer) => state.asset);
  const [selected, setSelected] = useState<boolean>(false);

  useEffect(() => {
    if (asset.length > 0) {
      setSelected(true);
    }
  }, [asset]);

  const assetHandler = () => {
    setSelected(true);
    setGetAssets((prev) => !prev);
  };
  return (
    <div>
      {selected && <div className="text-black">Selected: {asset[0].unit}</div>}
      <button
        id="dropdownDefaultButton"
        data-dropdown-toggle="dropdown"
        className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
        type="button"
        onClick={() => {
          setGetAssets((prev) => !prev);
        }}
      >
        Select your Asset{" "}
        <svg
          className="w-2.5 h-2.5 ms-3"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 10 6"
        >
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="m1 1 4 4 4-4"
          />
        </svg>
      </button>

      {getAssets && (
        <>
          <div className="absolute bg-blue-600 top-15 flex flex-col items-start rounded-lg">
            {/**Assest Hex */}
            <AssetHexList callback={assetHandler} />
          </div>
        </>
      )}
    </div>
  );
}

export default SelectAssetButton;
