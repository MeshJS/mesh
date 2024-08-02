// import { useContext, useState } from "react";
// import { Transaction } from "@meshsdk/core";
// import { WalletContext } from "../contexts";
// import type { Era, Protocol } from "@meshsdk/common";

// export const useWalletTx = (
//   options: {
//     era?: Era;
//     parameters?: Protocol;
//   } = {}
// ) => {
//   const { era, parameters } = options;

//   const { hasConnectedWallet, connectedWalletInstance } =
//     useContext(WalletContext);

//   const [tx] = useState<Transaction>(() => {
//     if (hasConnectedWallet) {
//       return new Transaction({
//         initiator: connectedWalletInstance,
//         parameters,
//         era,
//       });
//     }

//     throw new Error(
//       "Please make sure to connect a wallet before calling useWalletTx"
//     );
//   });

//   return tx;
// };
