import type { TransactionPrototype } from "@meshsdk/common";

import { transactionPrototypeFromHex } from "../../src/tx-prototype-from-cbor";
import { transactionPrototypeToHex } from "../../src/tx-prototype-to-cbor";

const TX_HASH = "11".repeat(32);
const TX_HASH_2 = "22".repeat(32);
const KEY_HASH = "aa".repeat(28);
const POOL_KEY_HASH = "bb".repeat(28);
const ANCHOR_HASH = "cc".repeat(32);
const ADDRESS =
  "addr_test1qpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0uafhxhu32dys6pvn6wlw8dav6cmp4pmtv7cc3yel9uu0nq93swx9";
const REWARD_ACCOUNT = "stake_test1uqdgagy7x7mtcta2qyyg244efgtr57wg5mxa2wwnvrx845s4sa2vp";
const POLICY_ID = "aa".repeat(28);
const SCRIPT_CBOR = "4d01000033222220051200120011";

const base = (): TransactionPrototype => ({
  body: {
    fee: "170000",
    inputs: [{ transaction_id: TX_HASH, index: 0 }],
    outputs: [{ address: ADDRESS, amount: { coin: "5000000" } }],
  },
  is_valid: true,
  witness_set: {},
});

/**
 * The core property: encoding a prototype and decoding it back yields the same prototype.
 * This exercises far more of the encoder than field-by-field assertions can — every field must
 * survive the trip through real CBOR.
 */
const roundTrip = (proto: TransactionPrototype): TransactionPrototype =>
  transactionPrototypeFromHex(transactionPrototypeToHex(proto));

describe("encode -> decode round trip", () => {
  it("preserves a minimal transaction exactly", () => {
    expect(roundTrip(base())).toEqual(base());
  });

  it("preserves is_valid = false", () => {
    const proto = { ...base(), is_valid: false };
    expect(roundTrip(proto).is_valid).toBe(false);
  });

  it("preserves every scalar body field", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        ttl: "100000000",
        validity_start_interval: "99999000",
        total_collateral: "2000000",
        current_treasury_value: "123456789",
        donation: "1000000",
        auxiliary_data_hash: "33".repeat(32),
        script_data_hash: "44".repeat(32),
        network_id: { type: "TESTNET" },
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves multi-asset values and negative mint quantities (burns)", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        outputs: [
          {
            address: ADDRESS,
            amount: { coin: "5000000", multiasset: { [POLICY_ID]: { "74657374": "10" } } },
          },
        ],
        mint: { [POLICY_ID]: { "6d696e74": "5", "6275726e": "-3" } },
      },
    };
    const out = roundTrip(proto);
    expect(out.body.mint![POLICY_ID]!["6275726e"]).toEqual("-3");
    expect(out).toEqual(proto);
  });

  it("preserves collateral, reference inputs and required signers", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        collateral: [{ transaction_id: TX_HASH_2, index: 1 }],
        reference_inputs: [{ transaction_id: TX_HASH_2, index: 2 }],
        required_signers: [KEY_HASH],
        collateral_return: { address: ADDRESS, amount: { coin: "1000000" } },
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves withdrawals", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: { ...base().body, withdrawals: { [REWARD_ACCOUNT]: "2000000" } },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves an inline datum's full structure", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        outputs: [
          {
            address: ADDRESS,
            amount: { coin: "5000000" },
            plutus_data: {
              type: "DATA",
              value: {
                type: "MANUAL",
                data: {
                  type: "CONSTR",
                  alternative: 1n,
                  fields: [
                    { type: "INTEGER", value: -42n },
                    { type: "BYTES", value: "cafe" },
                    { type: "LIST", value: [{ type: "INTEGER", value: 7n }] },
                    {
                      type: "MAP",
                      value: [[{ type: "BYTES", value: "00" }, { type: "INTEGER", value: 1n }]],
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves a datum hash", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        outputs: [
          {
            address: ADDRESS,
            amount: { coin: "5000000" },
            plutus_data: { type: "DATA_HASH", value: "55".repeat(32) },
          },
        ],
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves each plutus script version in its own field", () => {
    const proto: TransactionPrototype = {
      ...base(),
      witness_set: {
        plutus_v1_scripts: [SCRIPT_CBOR],
        plutus_v2_scripts: [SCRIPT_CBOR],
        plutus_v3_scripts: [SCRIPT_CBOR],
      },
    };
    const out = roundTrip(proto);
    expect(out.witness_set.plutus_v1_scripts).toHaveLength(1);
    expect(out.witness_set.plutus_v2_scripts).toHaveLength(1);
    expect(out.witness_set.plutus_v3_scripts).toHaveLength(1);
  });

  it("does not leak a V3 script into the V1 field across a round trip", () => {
    const proto: TransactionPrototype = {
      ...base(),
      witness_set: { plutus_v3_scripts: [SCRIPT_CBOR] },
    };
    const out = roundTrip(proto);
    expect(out.witness_set.plutus_v1_scripts).toBeUndefined();
    expect(out.witness_set.plutus_v2_scripts).toBeUndefined();
    expect(out.witness_set.plutus_v3_scripts).toHaveLength(1);
  });

  it("preserves vkey witnesses and native scripts", () => {
    const proto: TransactionPrototype = {
      ...base(),
      witness_set: {
        vkeys: [{ vkey: "dd".repeat(32), signature: "ee".repeat(64) }],
        native_scripts: [
          {
            type: "SCRIPT_N_OF_K",
            value: {
              n: 1n,
              native_scripts: [
                { type: "SCRIPT_PUBKEY", value: { addr_keyhash: KEY_HASH } },
                { type: "TIMELOCK_START", value: { slot: "100" } },
              ],
            },
          },
        ],
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves redeemers including their tag and ex units", () => {
    const proto: TransactionPrototype = {
      ...base(),
      witness_set: {
        redeemers: [
          {
            tag: { type: "SPEND" },
            index: "0",
            data: { type: "MANUAL", data: { type: "INTEGER", value: 1n } },
            ex_units: { mem: "1000", steps: "500" },
          },
          {
            tag: { type: "VOTING_PROPOSAL" },
            index: "2",
            data: { type: "MANUAL", data: { type: "BYTES", value: "ff" } },
            ex_units: { mem: "7", steps: "9" },
          },
        ],
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves transaction metadata", () => {
    const proto: TransactionPrototype = {
      ...base(),
      auxiliary_data: {
        prefer_alonzo_format: true,
        metadata: {
          "674": {
            type: "MAP",
            value: [
              [
                { type: "STRING", value: "msg" },
                { type: "LIST", value: [{ type: "STRING", value: "hello" }] },
              ],
              [
                { type: "STRING", value: "n" },
                { type: "INT", value: -5n },
              ],
            ],
          },
        },
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves certificates", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        certs: [
          {
            type: "STAKE_DELEGATION",
            value: {
              stake_credential: { type: "KEY", value: KEY_HASH },
              pool_keyhash: POOL_KEY_HASH,
            },
          },
          { type: "POOL_RETIREMENT", value: { pool_keyhash: POOL_KEY_HASH, epoch: 450n } },
          {
            type: "VOTE_DELEGATION",
            value: {
              stake_credential: { type: "SCRIPT", value: KEY_HASH },
              drep: { type: "ALWAYS_ABSTAIN" },
            },
          },
        ],
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves voting procedures", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        voting_procedures: [
          {
            voter: { type: "STAKING_POOL", value: KEY_HASH },
            votes: [
              {
                action_id: { transaction_id: TX_HASH, index: 0 },
                voting_procedure: { vote: { type: "YES" }, anchor: null },
              },
            ],
          },
        ],
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  it("preserves an INFO_ACTION governance proposal", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        voting_proposals: [
          {
            deposit: "100000000000",
            reward_account: REWARD_ACCOUNT,
            governance_action: { type: "INFO_ACTION" },
            anchor: { anchor_url: "https://example.com", anchor_data_hash: ANCHOR_HASH },
          },
        ],
      },
    };
    expect(roundTrip(proto)).toEqual(proto);
  });

  // These are all else-branch cases in the encoder (`=== "MAINNET" ? 1 : 0`,
  // `=== "CBOR" ? … : manual`, `=== "YES" ? … : === "NO" ? … : "Abstain"`), i.e. exactly where an
  // inverted comparison would go unnoticed without an explicit case.
  it.each(["MAINNET", "TESTNET"] as const)("preserves network id %s", (type) => {
    const proto: TransactionPrototype = {
      ...base(),
      body: { ...base().body, network_id: { type } },
    };
    expect(roundTrip(proto).body.network_id).toEqual({ type });
  });

  it.each(["YES", "NO", "ABSTAIN"] as const)("preserves vote kind %s", (type) => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        voting_procedures: [
          {
            voter: { type: "STAKING_POOL", value: KEY_HASH },
            votes: [
              {
                action_id: { transaction_id: TX_HASH, index: 0 },
                voting_procedure: { vote: { type }, anchor: null },
              },
            ],
          },
        ],
      },
    };
    expect(roundTrip(proto).body.voting_procedures![0]!.votes[0]!.voting_procedure.vote).toEqual({
      type,
    });
  });

  it.each([
    ["CONSTITUTIONAL_COMMITTEE_HOT_CRED" as const, { type: "KEY" as const, value: KEY_HASH }],
    ["DREP" as const, { type: "SCRIPT" as const, value: KEY_HASH }],
  ])("preserves voter kind %s", (type, value) => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        voting_procedures: [
          {
            voter: { type, value },
            votes: [
              {
                action_id: { transaction_id: TX_HASH, index: 0 },
                voting_procedure: { vote: { type: "YES" }, anchor: null },
              },
            ],
          },
        ],
      },
    };
    expect(roundTrip(proto).body.voting_procedures![0]!.voter).toEqual({ type, value });
  });

  it("preserves an anchor on a voting procedure", () => {
    const anchor = { anchor_url: "https://example.com", anchor_data_hash: ANCHOR_HASH };
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        voting_procedures: [
          {
            voter: { type: "STAKING_POOL", value: KEY_HASH },
            votes: [
              {
                action_id: { transaction_id: TX_HASH, index: 3 },
                voting_procedure: { vote: { type: "NO" }, anchor },
              },
            ],
          },
        ],
      },
    };
    expect(roundTrip(proto).body.voting_procedures![0]!.votes[0]!.voting_procedure.anchor).toEqual(
      anchor,
    );
  });

  it("preserves a script_ref on an output", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        outputs: [
          {
            address: ADDRESS,
            amount: { coin: "5000000" },
            // Script-wrapped native script: [0, [0, keyhash]]
            script_ref: `8200820058-1c${KEY_HASH}`.replace("-", ""),
          },
        ],
      },
    };
    expect(roundTrip(proto).body.outputs[0]!.script_ref).toBeDefined();
  });

  // Before the `utils/certificate.ts` fix this came back as STAKE_AND_VOTE_DELEGATION with the
  // deposit gone, because the encoder emitted CDDL cert 10 instead of 13.
  it("preserves STAKE_VOTE_REGISTRATION_AND_DELEGATION including its deposit", () => {
    const cert = {
      type: "STAKE_VOTE_REGISTRATION_AND_DELEGATION" as const,
      value: {
        stake_credential: { type: "KEY" as const, value: KEY_HASH },
        pool_keyhash: POOL_KEY_HASH,
        drep: { type: "ALWAYS_ABSTAIN" as const },
        coin: "2000000",
      },
    };
    const out = roundTrip({ ...base(), body: { ...base().body, certs: [cert] } });
    expect(out.body.certs![0]).toEqual(cert);
  });

  it("preserves POOL_REGISTRATION and stays re-encodable", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        certs: [
          {
            type: "POOL_REGISTRATION",
            value: {
              pool_params: {
                operator: POOL_KEY_HASH,
                vrf_keyhash: "cc".repeat(32),
                pledge: "1000000",
                cost: "340000000",
                margin: { numerator: "3", denominator: "100" },
                reward_account: REWARD_ACCOUNT,
                pool_owners: [KEY_HASH],
                relays: [
                  { type: "SINGLE_HOST_ADDR", value: { ipv4: [1, 2, 3, 4], ipv6: null, port: 3001 } },
                  { type: "SINGLE_HOST_NAME", value: { dns_name: "relay.example.com", port: 3001 } },
                  { type: "MULTI_HOST_NAME", value: { dns_name: "_relay._tcp.example.com" } },
                ],
                pool_metadata: { url: "https://example.com/p.json", pool_metadata_hash: "dd".repeat(32) },
              },
            },
          },
        ],
      },
    };
    const out = roundTrip(proto);
    const params = (out.body.certs![0]!.value as { pool_params: { operator: string; pool_owners: string[] } })
      .pool_params;
    // Regression: these came back bech32 ("pool1…" / "stake_test1…"), which the encoder rejects.
    expect(params.operator).toEqual(POOL_KEY_HASH);
    expect(params.pool_owners).toEqual([KEY_HASH]);
    expect(() => transactionPrototypeToHex(out)).not.toThrow();
  });

  // Closing the certificate variants the coverage audit found implemented-but-untested.
  const certCases = {
    COMMITTEE_HOT_AUTH: {
      type: "COMMITTEE_HOT_AUTH" as const,
      value: {
        committee_cold_credential: { type: "KEY" as const, value: KEY_HASH },
        committee_hot_credential: { type: "SCRIPT" as const, value: POOL_KEY_HASH },
      },
    },
    COMMITTEE_COLD_RESIGN: {
      type: "COMMITTEE_COLD_RESIGN" as const,
      value: {
        committee_cold_credential: { type: "KEY" as const, value: KEY_HASH },
        anchor: { anchor_url: "https://example.com", anchor_data_hash: ANCHOR_HASH },
      },
    },
    DREP_DEREGISTRATION: {
      type: "DREP_DEREGISTRATION" as const,
      value: { voting_credential: { type: "KEY" as const, value: KEY_HASH }, coin: "500000000" },
    },
    DREP_UPDATE: {
      type: "DREP_UPDATE" as const,
      value: {
        voting_credential: { type: "SCRIPT" as const, value: KEY_HASH },
        anchor: { anchor_url: "https://example.com", anchor_data_hash: ANCHOR_HASH },
      },
    },
    STAKE_REGISTRATION_AND_DELEGATION: {
      type: "STAKE_REGISTRATION_AND_DELEGATION" as const,
      value: {
        stake_credential: { type: "KEY" as const, value: KEY_HASH },
        pool_keyhash: POOL_KEY_HASH,
        coin: "2000000",
      },
    },
    VOTE_REGISTRATION_AND_DELEGATION: {
      type: "VOTE_REGISTRATION_AND_DELEGATION" as const,
      value: {
        stake_credential: { type: "KEY" as const, value: KEY_HASH },
        drep: { type: "SCRIPT_HASH" as const, value: POOL_KEY_HASH },
        coin: "2000000",
      },
    },
  };

  it.each(Object.entries(certCases))("preserves certificate %s", (_name, cert) => {
    const out = roundTrip({ ...base(), body: { ...base().body, certs: [cert] } });
    expect(out.body.certs![0]).toEqual(cert);
  });

  // Governance actions the audit flagged as implemented in both directions but never exercised.
  const GOV_ACTION_ID = { transaction_id: TX_HASH_2, index: 7 };
  const anchor = { anchor_url: "https://example.com", anchor_data_hash: ANCHOR_HASH };

  const govCases = {
    NO_CONFIDENCE_ACTION: {
      type: "NO_CONFIDENCE_ACTION" as const,
      value: { gov_action_id: GOV_ACTION_ID },
    },
    HARD_FORK_INITIATION_ACTION: {
      type: "HARD_FORK_INITIATION_ACTION" as const,
      value: { gov_action_id: GOV_ACTION_ID, protocol_version: { major: 10, minor: 0 } },
    },
    NEW_CONSTITUTION_ACTION: {
      type: "NEW_CONSTITUTION_ACTION" as const,
      value: {
        gov_action_id: GOV_ACTION_ID,
        constitution: { anchor, script_hash: POOL_KEY_HASH },
      },
    },
    UPDATE_COMMITTEE_ACTION: {
      type: "UPDATE_COMMITTEE_ACTION" as const,
      value: {
        gov_action_id: GOV_ACTION_ID,
        committee: {
          members: [
            { stake_credential: { type: "KEY" as const, value: KEY_HASH }, term_limit: 500n },
          ],
          quorum_threshold: { numerator: "2", denominator: "3" },
        },
        members_to_remove: [{ type: "SCRIPT" as const, value: POOL_KEY_HASH }],
      },
    },
  };

  it.each(Object.entries(govCases))("preserves governance action %s", (_name, action) => {
    const proposal = {
      deposit: "100000000000",
      reward_account: REWARD_ACCOUNT,
      governance_action: action,
      anchor,
    };
    const out = roundTrip({ ...base(), body: { ...base().body, voting_proposals: [proposal] } });
    expect(out.body.voting_proposals![0]).toEqual(proposal);
  });

  // `gov_action_id` was set by no test at all — only its null branch ran.
  it("preserves a non-null gov_action_id", () => {
    const proposal = {
      deposit: "100000000000",
      reward_account: REWARD_ACCOUNT,
      governance_action: {
        type: "NO_CONFIDENCE_ACTION" as const,
        value: { gov_action_id: GOV_ACTION_ID },
      },
      anchor,
    };
    const out = roundTrip({ ...base(), body: { ...base().body, voting_proposals: [proposal] } });
    const value = (out.body.voting_proposals![0]!.governance_action as { value: { gov_action_id: unknown } })
      .value;
    expect(value.gov_action_id).toEqual(GOV_ACTION_ID);
  });

  it("preserves a TREASURY_WITHDRAWALS_ACTION policy_hash (guardrails script)", () => {
    const proposal = {
      deposit: "100000000000",
      reward_account: REWARD_ACCOUNT,
      governance_action: {
        type: "TREASURY_WITHDRAWALS_ACTION" as const,
        value: { withdrawals: { [REWARD_ACCOUNT]: "5000000" }, policy_hash: POOL_KEY_HASH },
      },
      anchor,
    };
    const out = roundTrip({ ...base(), body: { ...base().body, voting_proposals: [proposal] } });
    expect(out.body.voting_proposals![0]).toEqual(proposal);
  });

  // auxiliary_data_map keys 2/3/4 — the witness-set equivalents were tested, these were not, so
  // an off-by-one in the aux setters would have gone unnoticed.
  it("preserves auxiliary-data plutus scripts in their per-version fields", () => {
    const proto: TransactionPrototype = {
      ...base(),
      auxiliary_data: {
        prefer_alonzo_format: true,
        plutus_v1_scripts: [SCRIPT_CBOR],
        plutus_v2_scripts: [SCRIPT_CBOR],
        plutus_v3_scripts: [SCRIPT_CBOR],
      },
    };
    const aux = roundTrip(proto).auxiliary_data!;
    expect(aux.plutus_v1_scripts).toHaveLength(1);
    expect(aux.plutus_v2_scripts).toHaveLength(1);
    expect(aux.plutus_v3_scripts).toHaveLength(1);
  });

  it("does not put an aux-data V3 script into the V1 field", () => {
    const proto: TransactionPrototype = {
      ...base(),
      auxiliary_data: { prefer_alonzo_format: true, plutus_v3_scripts: [SCRIPT_CBOR] },
    };
    const aux = roundTrip(proto).auxiliary_data!;
    expect(aux.plutus_v1_scripts).toBeUndefined();
    expect(aux.plutus_v3_scripts).toHaveLength(1);
  });

  // The only Metadatum variant with no coverage: pins the number[] <-> bytes conversion, which is
  // shaped differently from PlutusData's hex-string BYTES.
  it("preserves a BYTES metadatum (byte array, not hex string)", () => {
    const proto: TransactionPrototype = {
      ...base(),
      auxiliary_data: {
        prefer_alonzo_format: true,
        metadata: { "674": { type: "BYTES", value: [0, 1, 254, 255] } },
      },
    };
    expect(roundTrip(proto).auxiliary_data!.metadata!["674"]).toEqual({
      type: "BYTES",
      value: [0, 1, 254, 255],
    });
  });

  it("is stable — a second round trip is a fixed point", () => {
    const once = roundTrip(base());
    expect(roundTrip(once)).toEqual(once);
  });

  it("decodes both set encodings to the same prototype", () => {
    const proto = base();
    expect(transactionPrototypeFromHex(transactionPrototypeToHex(proto, { taggedSets: true }))).toEqual(
      transactionPrototypeFromHex(transactionPrototypeToHex(proto, { taggedSets: false })),
    );
  });
});

describe("documented round-trip asymmetries", () => {
  it("normalises explicit null/[] to absent (stable from the second pass)", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: { ...base().body, certs: null, collateral: [], ttl: null },
    };
    const once = roundTrip(proto);
    expect(once.body.certs).toBeUndefined();
    expect(once.body.collateral).toBeUndefined();
    expect(once.body.ttl).toBeUndefined();
    expect(roundTrip(once)).toEqual(once);
  });

  it("expands a CBOR-variant datum into its MANUAL structure", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        outputs: [
          {
            address: ADDRESS,
            amount: { coin: "5000000" },
            // "01" is CBOR for the integer 1.
            plutus_data: { type: "DATA", value: { type: "CBOR", hex: "01" } },
          },
        ],
      },
    };
    const datum = roundTrip(proto).body.outputs[0]!.plutus_data;
    expect(datum).toEqual({
      type: "DATA",
      value: { type: "MANUAL", data: { type: "INTEGER", value: 1n } },
    });
  });

  it("loses a STAKE_REGISTRATION deposit — encoder emits the no-deposit cert form", () => {
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        certs: [
          {
            type: "STAKE_REGISTRATION",
            value: { stake_credential: { type: "KEY", value: KEY_HASH }, coin: "2000000" },
          },
        ],
      },
    };
    const cert = roundTrip(proto).body.certs![0]!;
    expect(cert.type).toEqual("STAKE_REGISTRATION");
    expect((cert.value as { coin: string | null }).coin).toBeNull();
  });

  it("truncates an epoch above 2^53 — encoder narrows to number at the Mesh boundary", () => {
    const huge = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    const proto: TransactionPrototype = {
      ...base(),
      body: {
        ...base().body,
        certs: [{ type: "POOL_RETIREMENT", value: { pool_keyhash: POOL_KEY_HASH, epoch: huge } }],
      },
    };
    const cert = roundTrip(proto).body.certs![0]!;
    expect((cert.value as { epoch: bigint }).epoch).not.toEqual(huge);
  });
});
