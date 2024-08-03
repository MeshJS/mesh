import { MenuItem } from "~/types/menu-item";
import { metaData } from "./links-data";
import { metaProviders } from "./links-providers";
import { metaReact } from "./links-react";
import { metaTransaction } from "./links-transactions";
import { metaTxbuilder } from "./links-txbuilders";
import { metaUtilities } from "./links-utilities";
import { metaWallets } from "./links-wallets";

export const linksApi: MenuItem[] = [
  metaWallets,
  metaTransaction,
  metaTxbuilder, // todo, work on txbuilder docs
  metaData,
  metaReact,
  metaProviders,
  metaUtilities,
];
