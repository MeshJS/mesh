import {
  KoiosSupportedNetworks,
  MaestroSupportedNetworks,
} from "@meshsdk/core";

import Input from "~/components/form/input";
import InputTable from "~/components/sections/input-table";
import { useProviders } from "~/hooks/useProviders";
import Select from "../form/select";

export default function BlockchainProviderKey({
  provider,
}: {
  provider: string;
}) {
  const blockfrostKey = useProviders((state) => state.blockfrostKey);
  const setBlockfrostKey = useProviders((state) => state.setBlockfrostKey);
  const koiosKey = useProviders((state) => state.koiosKey);
  const setKoiosKey = useProviders((state) => state.setKoiosKey);
  const maestroKey = useProviders((state) => state.maestroKey);
  const setMaestroKey = useProviders((state) => state.setMaestroKey);
  const yaciUrl = useProviders((state) => state.yaciUrl);
  const setYaciUrl = useProviders((state) => state.setYaciUrl);
  const yaciAdminUrl = useProviders((state) => state.yaciAdminUrl);
  const setYaciAdminUrl = useProviders((state) => state.setYaciAdminUrl);
  const ogmiosUrl = useProviders((state) => state.ogmiosUrl);
  const setOgmiosUrl = useProviders((state) => state.setOgmiosUrl);
  const utxorpc = useProviders((state) => state.utxorpc);
  const setUTxORPC = useProviders((state) => state.setUTxORPC);
  const hydraUrl = useProviders((state) => state.hydraUrl);
  const setHydraUrl = useProviders((state) => state.setHydraUrl);

  if (provider == "maestro") {
    return (
      <InputTable
        listInputs={[
          <Input
            value={maestroKey?.apiKey || ""}
            onChange={(e) =>
              setMaestroKey(maestroKey?.network || "Preprod", e.target.value)
            }
            placeholder="API Key"
            label="API Key"
            type="password"
            key={0}
          />,
          <Select
            id="selectNetwork"
            options={{
              Preprod: "Preprod",
              Preview: "Preview",
              Mainnet: "Mainnet",
            }}
            value={maestroKey?.network || "Preprod"}
            onChange={(e) =>
              setMaestroKey(
                e.target.value as MaestroSupportedNetworks,
                maestroKey?.apiKey || "",
              )
            }
            label="Select network"
            key={1}
          />,
        ]}
      />
    );
  }

  if (provider == "blockfrost") {
    return (
      <InputTable
        listInputs={[
          <Input
            value={blockfrostKey ?? ""}
            onChange={(e) => setBlockfrostKey(e.target.value)}
            placeholder="API Key"
            label="API Key"
            type="password"
            key={0}
          />,
        ]}
      />
    );
  }

  if (provider == "koios") {
    return (
      <InputTable
        listInputs={[
          <Input
            value={koiosKey?.apiKey || ""}
            onChange={(e) =>
              setKoiosKey(koiosKey?.network || "preprod", e.target.value)
            }
            placeholder="API Key"
            label="API Key"
            type="password"
            key={0}
          />,
          <Select
            id="selectNetwork"
            options={{
              api: "api",
              preview: "preview",
              preprod: "preprod",
              guild: "guild",
            }}
            value={koiosKey?.network || "preprod"}
            onChange={(e) =>
              setKoiosKey(
                e.target.value as KoiosSupportedNetworks,
                koiosKey?.apiKey || "",
              )
            }
            label="Select network"
            key={1}
          />,
        ]}
      />
    );
  }

  if (provider == "yaci") {
    return (
      <InputTable
        listInputs={[
          <Input
            value={yaciUrl}
            onChange={(e) => setYaciUrl(e.target.value)}
            placeholder="e.g. http://localhost:8080/api/v1/"
            label="Instance URL"
            key={0}
          />,
          <Input
            value={yaciAdminUrl}
            onChange={(e) => setYaciAdminUrl(e.target.value)}
            placeholder="e.g. http://localhost:10000"
            label="Instance Admin URL"
            key={0}
          />,
        ]}
      />
    );
  }

  if (provider == "ogmios") {
    return (
      <InputTable
        listInputs={[
          <Input
            value={ogmiosUrl}
            onChange={(e) => setOgmiosUrl(e.target.value)}
            placeholder="Instance URL"
            label="Instance URL"
            type="password"
            key={0}
          />,
        ]}
      />
    );
  }

  if (provider == "hydra") {
    return (
      <InputTable
        listInputs={[
          <Input
            value={hydraUrl ?? ""}
            onChange={(e) => setHydraUrl(e.target.value)}
            placeholder="e.g. http://123.45.67.890:4001"
            label="Hydra Head URL and Port"
            type="password"
            key={0}
          />,
        ]}
      />
    );
  }

  if (provider == "utxorpc") {
    return (
      <InputTable
        listInputs={[
          <Input
            value={utxorpc.url}
            onChange={(e) => setUTxORPC(e.target.value, utxorpc.key)}
            placeholder="Instance URL"
            label="Instance URL"
            key={0}
          />,
          <Input
            value={utxorpc.key}
            onChange={(e) => setUTxORPC(utxorpc.url, e.target.value)}
            placeholder="Key"
            label="Key"
            type="password"
            key={1}
          />,
        ]}
      />
    );
  }

  return <></>;
}
