import SvgMesh from "~/components/svgs/mesh";
import SvgPolkadot from "~/components/svgs/polkadot";
import { MenuItem } from "~/types/menu-item";
import { metaAiken } from "./links-aiken";
import { metaHydra } from "./links-hydra";
import { metaMidnight } from "./links-midnight";
import { metaProviders } from "./links-providers";
import { metaReact } from "./links-react";
import { metaSmartContract } from "./links-smart-contracts";
import { metaSvelte } from "./links-svelte";
import { metaTxbuilder } from "./links-txbuilders";
import { metaTxParser } from "./links-txparser";
import { metaUtilities } from "./links-utilities";
import { metaWallets } from "./links-wallets";
import { metaYaci } from "./links-yaci";

export const metaPolkadot: MenuItem = {
  title: "Polkadot",
  desc: "Tools and resources for developers to build on Polkadot",
  link: "https://polkadot.meshjs.dev/",
  icon: SvgPolkadot,
};

export const metaWeb3Wallet: MenuItem = {
  title: "Wallet as a Service",
  desc: "Access self-custodial wallet using social logins",
  link: "https://utxos.dev/",
  icon: SvgMesh,
};

export const linksApi: MenuItem[] = [
  metaWallets,
  metaTxbuilder,
  metaTxParser,
  metaProviders,
  metaUtilities,
  metaReact,
  metaSvelte,
  metaSmartContract,
  metaAiken,
  metaHydra,
  metaYaci,
  metaMidnight,
  // metaPolkadot,
  metaWeb3Wallet,
];
