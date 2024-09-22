import { resetAsset } from "@/redux/actions/asset";
import { resetCollateralUtxo } from "@/redux/actions/collateralUtxo";
import { resetFeeUtxo } from "@/redux/actions/feeUtxo";
import { resetWalletAddress } from "@/redux/actions/walletAddress";
import { resetWalletList } from "@/redux/actions/walletList";
import walletAddress from "@/redux/reducers/walletAddress";
import { AppDispatch } from "@/redux/store";
import { useWallet } from "@meshsdk/react";
import React from "react";
import { useDispatch } from "react-redux";

function SignOutButton(): React.JSX.Element {
  const { disconnect, connected } = useWallet();
  const dispatch: AppDispatch = useDispatch();

  const signOutHandler = () => {
    disconnect();
    dispatch(resetCollateralUtxo);
    dispatch(resetFeeUtxo);
    dispatch(resetWalletAddress);
    dispatch(resetWalletList);
    dispatch(resetAsset);
  };

  return (
    <div>
      <button onClick={signOutHandler}>Sign Out</button>
    </div>
  );
}

export default SignOutButton;
