import { addaccount } from "@/redux/actions/account";
import { adduserAddress, updateuserAddress } from "@/redux/actions/userAddress";
import { addwallet, updatewallet } from "@/redux/actions/wallet";
import { addWalletList, updateWalletList } from "@/redux/actions/walletList";
import { RootReducer } from "@/redux/rootReducer";
import { AppDispatch } from "@/redux/store";
import { AppWallet, BrowserWallet, Wallet } from "@meshsdk/core";
import { WalletContext, useAddress, useWallet } from "@meshsdk/react";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

function ConnectButton() {
  const { connect, connected } = useWallet();
  const [cardanoWallet, setcardanoWallet] = useState<Array<Wallet>>([]);
  const address = useAddress();
  const walletList = useSelector((state: RootReducer) => state.walletList);
  const userAddress = useSelector((state: RootReducer) => state.userAddress);

  const dispatch: AppDispatch = useDispatch();
  useEffect(() => {
    setcardanoWallet(BrowserWallet.getInstalledWallets());
    dispatch(
      walletList.length > 0
        ? updateWalletList(BrowserWallet.getInstalledWallets())
        : addWalletList(BrowserWallet.getInstalledWallets())
    );
    dispatch(adduserAddress(address));
  }, [dispatch, walletList.length, address]);

  useEffect(() => {
    console.log(userAddress, address);
  }, [userAddress]);

  const connectWallet = async (walletName: string) => {
    try {
      //seems eternl wallet cannot connect by this call
      await connect(walletName);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    !connected && (
      <>
        {cardanoWallet.map((wallet) => (
          <button
            key={wallet.name}
            className=" text-black"
            onClick={() => connectWallet(wallet.name)}
          >
            Connect to {wallet.name}
          </button>
        ))}
      </>
    )
  );
}

export default ConnectButton;
