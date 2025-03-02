import { MenuItem } from "~/types/menu-item";
import { metaAiken } from "./links-aiken";
import { metaProviders } from "./links-providers";
import { metaReact } from "./links-react";
import { metaSmartContract } from "./links-smart-contracts";
import { metaSvelte } from "./links-svelte";
import { metaTxbuilder } from "./links-txbuilders";
import { metaUtilities } from "./links-utilities";
import { metaWallets } from "./links-wallets";
import { metaYaci } from "./links-yaci";

export const linksApi: MenuItem[] = [
  metaWallets,
  metaTxbuilder,
  metaReact,
  metaSvelte,
  metaProviders,
  metaUtilities,
  metaSmartContract,
  metaAiken,
  metaYaci,
];
