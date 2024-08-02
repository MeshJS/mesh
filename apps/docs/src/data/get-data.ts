import data_transactions from "./mesh-transactions.json";
import data_wallets from "./mesh-wallets.json";
import data_contracts from "./mesh-contracts.json";
import data_providers from "./mesh-providers.json";
import data_common from "./mesh-common.json";
import data_core_csl from "./mesh-core-csl.json";

export default function getData(dataSource: string) {
  let data: any = undefined;
  if (dataSource == "common") {
    data = data_common;
  }
  if (dataSource == "contracts") {
    data = data_contracts;
  }
  if (dataSource == "core-csl") {
    data = data_core_csl;
  }
  if (dataSource == "providers") {
    data = data_providers;
  }
  if (dataSource == "transactions") {
    data = data_transactions;
  }
  if (dataSource == "wallets") {
    data = data_wallets;
  }

  return data;
}
