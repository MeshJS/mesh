import * as cjsCardanopeerconnect from "@fabianbormann/cardano-peer-connect";
import { IWalletInfo as iwalletinfo } from "@fabianbormann/cardano-peer-connect/dist/src/types";

export const cardanopeerconnect: typeof cjsCardanopeerconnect & {
  default?: typeof cjsCardanopeerconnect;
} = cjsCardanopeerconnect;
const exportedCardanopeerconnect =
  cardanopeerconnect?.default || cardanopeerconnect;

export const DAppPeerConnect = exportedCardanopeerconnect.DAppPeerConnect;
export type DAppPeerConnect = cjsCardanopeerconnect.DAppPeerConnect;
export type IWalletInfo = iwalletinfo;
