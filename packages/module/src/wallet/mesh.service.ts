// import {
//   IFetcher,
//   IInitiator,
//   ISigner,
//   ISubmitter,
// } from '@mesh/common/contracts';
// import { AppWallet } from './app.service';
// import type { Address, TransactionUnspentOutput } from '@mesh/core';
// import type { Asset, DataSignature } from '@mesh/common/types';

// export type CreateAppWalletOptions = {
//   networkId: number;
//   fetcher: IFetcher;
//   submitter: ISubmitter;
//   key:
//     | {
//         type: 'root';
//         bech32: string;
//       }
//     | {
//         type: 'cli';
//         payment: string;
//         stake?: string;
//       }
//     | {
//         type: 'mnemonic';
//         words: string[];
//       };
// };

// export class MeshWallet implements IInitiator, ISigner, ISubmitter {
//   private readonly _fetcher: IFetcher;
//   private readonly _submitter: ISubmitter;
//   private readonly _wallet: AppWallet;

//   constructor(options: CreateAppWalletOptions) {
//     this._fetcher = options.fetcher;
//     this._submitter = options.submitter;

//     switch (options.key.type) {
//       case 'root':
//         this._wallet = new AppWallet({
//           networkId: 0,
//           fetcher: options.fetcher,
//           submitter: options.submitter,
//           key: {
//             type: 'root',
//             bech32: options.key.bech32,
//           },
//         });
//         break;
//       case 'cli':
//         this._wallet = new AppWallet({
//           networkId: 0,
//           fetcher: options.fetcher,
//           submitter: options.submitter,
//           key: {
//             type: 'cli',
//             payment: options.key.payment,
//           },
//         });
//         break;
//       case 'mnemonic':
//         this._wallet = new AppWallet({
//           networkId: 0,
//           fetcher: options.fetcher,
//           submitter: options.submitter,
//           key: {
//             type: 'mnemonic',
//             words: options.key.words,
//           },
//         });
//         break;
//     }
//   }

//   async getUsedAddress(): Promise<Address> {
//     const usedAddresses = await this._walletInstance.getUsedAddresses();
//     return deserializeAddress(usedAddresses[0]);
//   }

//   async getUsedCollateral(
//     limit = DEFAULT_PROTOCOL_PARAMETERS.maxCollateralInputs
//   ): Promise<TransactionUnspentOutput[]> {
//     const collateral =
//       (await this._walletInstance.experimental.getCollateral()) ?? [];
//     return collateral.map((c) => deserializeTxUnspentOutput(c)).slice(0, limit);
//   }

//   async getUsedUTxOs(
//     amount: Asset[] | undefined = undefined
//   ): Promise<TransactionUnspentOutput[]> {
//     const valueCBOR = amount ? toValue(amount).to_hex() : undefined;
//     const utxos = (await this._walletInstance.getUtxos(valueCBOR)) ?? [];
//     return utxos.map((u) => deserializeTxUnspentOutput(u));
//   }

//   signData(address: string, payload: string): Promise<DataSignature> {
//     const signerAddress = toAddress(address).to_hex();
//     return this._walletInstance.signData(signerAddress, fromUTF8(payload));
//   }

//   async signTx(unsignedTx: string, partialSign = false): Promise<string> {
//     try {
//       const tx = deserializeTx(unsignedTx);
//       const txWitnessSet = tx.witness_set();

//       const newWitnessSet = await this._walletInstance.signTx(
//         unsignedTx,
//         partialSign
//       );

//       const newSignatures =
//         deserializeTxWitnessSet(newWitnessSet).vkeys() ??
//         csl.Vkeywitnesses.new();

//       const txSignatures = mergeSignatures(txWitnessSet, newSignatures);

//       txWitnessSet.set_vkeys(txSignatures);

//       const signedTx = fromBytes(
//         csl.Transaction.new(
//           tx.body(),
//           txWitnessSet,
//           tx.auxiliary_data()
//         ).to_bytes()
//       );

//       return signedTx;
//     } catch (error) {
//       throw new Error(
//         `[BrowserWallet] An error occurred during signTx: ${JSON.stringify(
//           error
//         )}.`
//       );
//     }
//   }

//   /**
//    * Experimental feature - sign multiple transactions at once (Supported wallet(s): Typhon)
//    * @param unsignedTxs - array of unsigned transactions in CborHex string
//    * @param partialSign - if the transactions are signed partially
//    * @returns array of signed transactions CborHex string
//    */
//   async signTxs(unsignedTxs: string[], partialSign = false): Promise<string[]> {
//     let witnessSets: string[] | undefined = undefined;
//     // Hardcoded behavior customized for different wallet for now as there is no standard confirmed
//     switch (this._walletName) {
//       case 'Typhon Wallet':
//         if (this._walletInstance.signTxs) {
//           witnessSets = await this._walletInstance.signTxs(
//             unsignedTxs,
//             partialSign
//           );
//         }
//         break;
//       default:
//         if (this._walletInstance.signTxs) {
//           witnessSets = await this._walletInstance.signTxs(
//             unsignedTxs.map((cbor) => ({
//               cbor,
//               partialSign,
//             }))
//           );
//         } else if (this._walletInstance.experimental.signTxs) {
//           witnessSets = await this._walletInstance.experimental.signTxs(
//             unsignedTxs.map((cbor) => ({
//               cbor,
//               partialSign,
//             }))
//           );
//         }
//         break;
//     }

//     if (!witnessSets) throw new Error('Wallet does not support signTxs');

//     const signedTxs: string[] = [];
//     for (let i = 0; i < witnessSets.length; i++) {
//       const tx = deserializeTx(unsignedTxs[i]);
//       const txWitnessSet = tx.witness_set();

//       const newSignatures =
//         deserializeTxWitnessSet(witnessSets[i]).vkeys() ??
//         csl.Vkeywitnesses.new();

//       const txSignatures = mergeSignatures(txWitnessSet, newSignatures);

//       txWitnessSet.set_vkeys(txSignatures);

//       const signedTx = fromBytes(
//         csl.Transaction.new(
//           tx.body(),
//           txWitnessSet,
//           tx.auxiliary_data()
//         ).to_bytes()
//       );

//       signedTxs.push(signedTx);
//     }
//     return signedTxs;
//   }

//   submitTx(tx: string): Promise<string> {
//     return this._walletInstance.submitTx(tx);
//   }
// }
