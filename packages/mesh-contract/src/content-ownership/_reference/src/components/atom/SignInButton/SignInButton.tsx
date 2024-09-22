import wallet from "@/redux/reducers/wallet";
import { RootReducer } from "@/redux/rootReducer";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import ConnectButton from "../ConnectButton/ConnectButton";

function SignInButton() {
  const [getWallet, setGetWallet] = useState(false);

  return (
    <div>
      <button
        onClick={() => {
          setGetWallet((prev) => !prev);
        }}
      >
        {"Sign In"}
        {!getWallet}
      </button>
      {getWallet && (
        <>
          <div className="absolute bg-green-600 top-15 flex flex-col items-start rounded-lg">
            <ConnectButton />
          </div>
        </>
      )}
    </div>
  );
}

export default SignInButton;
