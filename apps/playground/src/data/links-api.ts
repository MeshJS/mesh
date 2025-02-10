import { MenuItem } from "~/types/menu-item";
import { metaAiken } from "./links-aiken";
import { metaProviders } from "./links-providers";
import { metaReact } from "./links-react";
import { metaSmartContract } from "./links-smart-contracts";
import { metaSvelte } from "./links-svelte";
import { metaTransaction } from "./links-transactions";
import { metaTxbuilder } from "./links-txbuilders";
import { metaUtilities } from "./links-utilities";
import { metaWallets } from "./links-wallets";
import { metaYaci } from "./links-yaci";

export const linksApi: MenuItem[] = [
  metaWallets,
  metaTxbuilder,
  metaTransaction,
  metaReact,
  metaSvelte,
  metaProviders,
  metaUtilities,
  metaSmartContract,
  metaAiken,
  metaYaci,
];
