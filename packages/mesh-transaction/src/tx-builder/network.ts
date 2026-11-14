import type {
  NativeScript,
  Network,
  NetworkConfig,
  PlutusScript,
} from "@meshsdk/common";
import { networkConfig } from "@meshsdk/common";
import {
  Address,
  keyHashToRewardAddress,
  scriptHashToBech32,
  scriptHashToRewardAddress,
} from "@meshsdk/core-cst";

import type { NetworkMismatchDetails } from "./errors";
import type { PartContext } from "./parts/normalize";
import type { CredentialInput, TxPart, Utxo } from "./parts/types";
import { TxBuildError } from "./errors";
import { toCredential } from "./parts/credentials";
import { TxPartError } from "./parts/errors";
import { toNativeScriptSource, toPlutusScriptSource } from "./parts/normalize";

/** The networks a provider can state, and whose name the builder passes on to its evaluator */
const PUBLIC_NETWORKS = ["mainnet", "preprod", "preview"] as const;

type PublicNetwork = (typeof PUBLIC_NETWORKS)[number];

const isPublicNetwork = (value: unknown): value is PublicNetwork =>
  PUBLIC_NETWORKS.includes(value as PublicNetwork);

const ALLOWED_NETWORKS =
  '"mainnet", "preprod", "preview", or a network config from customNetwork(...)';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Whether an object has the members of a `NetworkConfig` the builder reads, in a usable form */
const isUsableConfig = (value: object): value is NetworkConfig => {
  const { name, networkId, slotConfig } = value as Partial<NetworkConfig>;
  return (
    typeof name === "string" &&
    name.length > 0 &&
    (networkId === 0 || networkId === 1) &&
    typeof slotConfig === "object" &&
    slotConfig !== null &&
    isFiniteNumber(slotConfig.zeroTime) &&
    isFiniteNumber(slotConfig.zeroSlot) &&
    isFiniteNumber(slotConfig.slotLength) &&
    slotConfig.slotLength > 0
  );
};

/**
 * The builder's network from its `network` option: a public network by name, or a config with a
 * name, a network id of 0 or 1 and a slot clock with a positive slot length.
 * @throws TxBuildError INVALID_OPTION for anything else, `"testnet"` included
 */
export const resolveNetwork = (value: unknown): NetworkConfig => {
  const invalid = (cause?: unknown) =>
    new TxBuildError(
      "INVALID_OPTION",
      `the network option must be ${ALLOWED_NETWORKS}; got ${describe(value)}`,
      {
        details: { option: "network", value, allowed: ALLOWED_NETWORKS },
        ...(cause !== undefined && { cause }),
      },
    );
  if (typeof value === "string") {
    try {
      return networkConfig(value as PublicNetwork);
    } catch (error) {
      throw invalid(error);
    }
  }
  if (typeof value === "object" && value !== null && isUsableConfig(value))
    return networkConfig(value);
  throw invalid();
};

const describe = (value: unknown): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined || value === null) return "nothing";
  if (typeof value === "object")
    return "a config without a usable name, network id or slot clock";
  return String(value);
};

/**
 * The name an evaluator is told for the builder's network: a public network by its name, any
 * other as `"testnet"`, the name of a custom network in `Network`
 */
export const evaluatorNetwork = (network: NetworkConfig): Network =>
  isPublicNetwork(network.name) ? network.name : "testnet";

/**
 * Compares the network a provider states with the builder's, by name. Only `"mainnet"`,
 * `"preprod"` and `"preview"` are compared; any other value, or none, is not.
 * @throws TxBuildError NETWORK_MISMATCH when the provider states another public network
 */
export const checkProviderNetwork = (
  network: NetworkConfig,
  provider: { readonly network?: unknown },
) => {
  const stated = provider.network;
  if (!isPublicNetwork(stated) || stated === network.name) return;
  throw new TxBuildError(
    "NETWORK_MISMATCH",
    `the builder is for network ${network.name}, and its provider serves ${stated}; give a provider of ${network.name}, or build for ${stated}`,
    {
      details: {
        expected: { name: network.name, networkId: network.networkId },
        found: [{ role: "provider", network: stated }],
      },
    },
  );
};

/** Something whose network is checked: an address, or a network id stated without one */
export type NetworkEntry = NetworkMismatchDetails["found"][number];

type Role = NetworkEntry["role"];

/** The network id of an address text; undefined for a text that is not an address */
const networkIdOf = (address: unknown): number | undefined => {
  if (typeof address !== "string") return undefined;
  try {
    return Address.fromString(address)?.getNetworkId();
  } catch {
    return undefined;
  }
};

/**
 * Checks the network of every entry against the builder's: an address by the network id it
 * holds, an entry without an address by its `networkId`. A text that is not an address is passed
 * over. Every mismatch is reported in one error.
 * @throws TxBuildError NETWORK_MISMATCH listing each entry of another network
 */
export const checkNetworks = (
  network: NetworkConfig,
  entries: Iterable<NetworkEntry>,
) => {
  const found: NetworkEntry[] = [];
  for (const entry of entries) {
    const networkId =
      entry.address !== undefined
        ? networkIdOf(entry.address)
        : entry.networkId;
    if (networkId === undefined || networkId === network.networkId) continue;
    found.push({ ...entry, networkId });
  }
  if (found.length === 0) return;
  const [only] = found.length === 1 ? found : [];
  const listed = found
    .map((f) => {
      if (f.role === "body") return `its body states network id ${f.networkId}`;
      const where = `${f.part ?? f.role}${f.label !== undefined ? ` "${f.label}"` : ""}`;
      return `${where} ${f.address ?? ""} (network id ${f.networkId})`;
    })
    .join(", ");
  throw new TxBuildError(
    "NETWORK_MISMATCH",
    `the builder is for network ${network.name} (network id ${network.networkId}), and the transaction ${
      found.some((f) => f.role === "body")
        ? "is of another network"
        : `names ${found.length === 1 ? "an address" : "addresses"} of another network`
    }: ${listed}`,
    {
      ...(only?.part !== undefined && { part: only.part, label: only.label }),
      details: {
        expected: { name: network.name, networkId: network.networkId },
        found,
      },
    },
  );
};

const fromPart = (part: TxPart, role: Role, address: string): NetworkEntry => ({
  role,
  address,
  part: part.kind,
  ...(part.label !== undefined && { label: part.label }),
});

/** A UTxO's address, as an entry of the network check */
export const utxoEntry = (utxo: Readonly<Utxo>, part?: TxPart): NetworkEntry =>
  part
    ? fromPart(part, "utxo", utxo.address)
    : { role: "utxo", address: utxo.address };

/** The UTxOs a part holds in full: what it spends, reads or puts up, and its reference script */
export const heldUtxos = (part: TxPart): Readonly<Utxo>[] => {
  const utxos: Readonly<Utxo>[] = [];
  if ("utxo" in part && part.utxo) utxos.push(part.utxo);
  if ("witness" in part) {
    const { witness } = part;
    if (
      (witness.type === "native" || witness.type === "plutus") &&
      witness.script.type === "reference" &&
      witness.script.utxo
    )
      utxos.push(witness.script.utxo);
  }
  return utxos;
};

/** Every address a part names, with the role it is checked in; UTxOs held in full included */
export const partEntries = (part: TxPart): NetworkEntry[] => {
  const entries = heldUtxos(part).map((utxo) => utxoEntry(utxo, part));
  switch (part.kind) {
    case "output":
      entries.push(fromPart(part, "output", part.output.address));
      break;
    case "collateralReturn":
      entries.push(fromPart(part, "collateralReturn", part.address));
      break;
    case "withdrawal":
      // A derived address is on the build's network by construction
      if (part.rewardAddress !== undefined)
        entries.push(fromPart(part, "withdrawal", part.rewardAddress));
      break;
    case "proposal": {
      const { proposal } = part;
      entries.push(fromPart(part, "rewardAccount", proposal.reward_account));
      const action = proposal.governance_action;
      if (action.type === "TREASURY_WITHDRAWALS_ACTION")
        for (const address of Object.keys(action.value.withdrawals))
          entries.push(fromPart(part, "rewardAccount", address));
      break;
    }
    case "certificate": {
      const { certificate } = part;
      if (certificate.type === "POOL_REGISTRATION")
        entries.push(
          fromPart(
            part,
            "rewardAccount",
            certificate.value.pool_params.reward_account,
          ),
        );
      break;
    }
  }
  return entries;
};

/* ---------------------------------------------------------------------------------------------
 * Addresses on the builder's network
 * ------------------------------------------------------------------------------------------- */

const NATIVE_TYPES = new Set([
  "sig",
  "all",
  "any",
  "atLeast",
  "after",
  "before",
]);

const SCRIPTS_ALLOWED = "a Plutus script { code, version } or a native script";
const CREDENTIALS_ALLOWED =
  'a bech32 reward address, or a credential { type: "KEY" | "SCRIPT", value: <28-byte hash in hex> }';

const invalidArgument = (
  option: string,
  value: unknown,
  allowed: string,
  cause?: TxPartError,
) =>
  new TxBuildError(
    "INVALID_OPTION",
    // The reason the part normaliser gave, without the part it names
    `invalid ${option}: expected ${allowed}${cause ? ` (${cause.message.replace(`${cause.part}: `, "")})` : ""}`,
    {
      details: { option, value, allowed },
      ...(cause !== undefined && { cause }),
    },
  );

/** Runs a part normaliser for a builder method, its TxPartError becoming INVALID_OPTION */
const asArgument = <T>(
  option: string,
  value: unknown,
  allowed: string,
  read: () => T,
): T => {
  try {
    return read();
  } catch (error) {
    if (error instanceof TxPartError)
      throw invalidArgument(option, value, allowed, error);
    throw error;
  }
};

const isPlutusScript = (value: unknown): value is PlutusScript =>
  typeof value === "object" && value !== null && "code" in value;

const isNativeScript = (value: unknown): value is NativeScript =>
  typeof value === "object" &&
  value !== null &&
  NATIVE_TYPES.has((value as { type?: unknown }).type as string);

/** The hash of a script, normalised as the parts normalise it; undefined for no script */
const scriptHashOf = (
  ctx: PartContext,
  option: string,
  script: unknown,
): string | undefined => {
  if (isPlutusScript(script))
    return asArgument(option, script, SCRIPTS_ALLOWED, () => {
      const source = toPlutusScriptSource(ctx, script);
      return source.type === "attached" ? source.scriptHash : undefined;
    });
  if (isNativeScript(script))
    return asArgument(option, script, SCRIPTS_ALLOWED, () => {
      const source = toNativeScriptSource(ctx, script);
      return source.type === "attached" ? source.scriptHash : undefined;
    });
  return undefined;
};

const credentialOf = (
  ctx: PartContext,
  option: string,
  value: unknown,
  allowed: string,
) => {
  if (
    typeof value !== "string" &&
    (typeof value !== "object" || value === null)
  )
    throw invalidArgument(option, value, allowed);
  return asArgument(option, value, allowed, () =>
    toCredential(ctx, value as CredentialInput),
  );
};

/**
 * The address of a script on a network: enterprise, or base with the given stake credential
 * as its delegation part
 */
export const scriptAddressOn = (
  network: NetworkConfig,
  script: PlutusScript | NativeScript,
  stake?: CredentialInput,
): string => {
  const ctx: PartContext = { part: "output" };
  const hash = scriptHashOf(ctx, "script", script);
  if (hash === undefined)
    throw invalidArgument("script", script, SCRIPTS_ALLOWED);
  if (stake === undefined)
    return scriptHashToBech32(hash, undefined, network.networkId);
  const credential = credentialOf(ctx, "stake", stake, CREDENTIALS_ALLOWED);
  return scriptHashToBech32(
    hash,
    credential.hash,
    network.networkId,
    credential.type === "script",
  );
};

/** The reward address of a script or a credential on a network */
export const rewardAddressOn = (
  network: NetworkConfig,
  credential: PlutusScript | NativeScript | CredentialInput,
): string => {
  const ctx: PartContext = { part: "withdrawal" };
  const allowed = `${SCRIPTS_ALLOWED}, ${CREDENTIALS_ALLOWED}`;
  const hash = scriptHashOf(ctx, "credential", credential);
  if (hash !== undefined)
    return scriptHashToRewardAddress(hash, network.networkId);
  const { type, hash: credentialHash } = credentialOf(
    ctx,
    "credential",
    credential,
    allowed,
  );
  return type === "script"
    ? scriptHashToRewardAddress(credentialHash, network.networkId)
    : keyHashToRewardAddress(credentialHash, network.networkId);
};
