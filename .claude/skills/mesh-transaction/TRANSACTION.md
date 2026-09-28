# MeshTxBuilder API Reference

Complete API documentation for `MeshTxBuilder` from `@meshsdk/transaction`.

## Table of Contents

- [Inputs](#inputs)
- [Outputs](#outputs)
- [Scripts - Spending](#scripts---spending)
- [Scripts - Minting](#scripts---minting)
- [Scripts - Withdrawal](#scripts---withdrawal)
- [Scripts - Voting](#scripts---voting)
- [Staking Certificates](#staking-certificates)
- [Governance (Conway Era)](#governance-conway-era)
- [Transaction Configuration](#transaction-configuration)
- [Completion Methods](#completion-methods)
- [Utility Methods](#utility-methods)
- [TxParser](#txparser)

---

## Inputs

### txIn
Add a transaction input (UTxO to spend).

```typescript
txIn(
  txHash: string,      // Transaction hash
  txIndex: number,     // Output index
  amount?: Asset[],    // Optional - fetched if not provided
  address?: string,    // Optional - fetched if not provided
  scriptSize?: number  // Size of ref script at this input (0 if none)
): this
```

### txInCollateral
Add collateral input (required for script transactions).

```typescript
txInCollateral(
  txHash: string,
  txIndex: number,
  amount?: Asset[],
  address?: string
): this
```

### readOnlyTxInReference
Add a read-only reference input (visible to scripts but not spent).

```typescript
readOnlyTxInReference(
  txHash: string,
  txIndex: number,
  scriptSize?: number
): this
```

---

## Outputs

### txOut
Add a transaction output.

```typescript
txOut(
  address: string,   // Recipient address
  amount: Asset[]    // Assets to send: [{ unit: 'lovelace', quantity: '5000000' }]
): this
```

### txOutDatumHashValue
Attach datum hash to output.

```typescript
txOutDatumHashValue(
  datum: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh"
): this
```

### txOutInlineDatumValue
Attach inline datum to output (stored on-chain with the UTxO).

```typescript
txOutInlineDatumValue(
  datum: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh"
): this
```

### txOutDatumEmbedValue
Embed datum in transaction (hash stored in output, full datum in tx body).

```typescript
txOutDatumEmbedValue(
  datum: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh"
): this
```

### txOutReferenceScript
Attach a reference script to output (for later use via reference).

```typescript
txOutReferenceScript(
  scriptCbor: string,
  version: "V1" | "V2" | "V3" = "V3"
): this
```

---

## Scripts - Spending

### spendingPlutusScript / spendingPlutusScriptV1 / V2 / V3
Signal that the next `txIn()` is a Plutus script input.

```typescript
// Dynamic version (pass version as parameter)
spendingPlutusScript(languageVersion: LanguageVersion): this

// Static shortcuts (equivalent to calling the dynamic version)
spendingPlutusScriptV1(): this  // Plutus V1
spendingPlutusScriptV2(): this  // Plutus V2
spendingPlutusScriptV3(): this  // Plutus V3 (Conway)
```

`LanguageVersion` = `"V1" | "V2" | "V3"`

**Usage:** Call BEFORE `txIn()` for script inputs. Both forms are equivalent — `.spendingPlutusScript("V3")` and `.spendingPlutusScriptV3()` produce identical results.

### txInScript
Provide the spending script CBOR.

```typescript
txInScript(scriptCbor: string): this
```

### txInDatumValue
Provide datum for script input.

```typescript
txInDatumValue(
  datum: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh"
): this
```

### txInInlineDatumPresent
Indicate the input UTxO has an inline datum (no need to provide it).

```typescript
txInInlineDatumPresent(): this
```

### txInRedeemerValue
Provide redeemer for script input.

```typescript
txInRedeemerValue(
  redeemer: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh",
  exUnits: { mem: number, steps: number } = DEFAULT_REDEEMER_BUDGET
): this
```

### spendingTxInReference
Use a reference script instead of providing the script inline.

```typescript
spendingTxInReference(
  txHash: string,      // UTxO containing the reference script
  txIndex: number,
  scriptSize?: string, // Script size in bytes
  scriptHash?: string  // Script hash
): this
```

### spendingReferenceTxInInlineDatumPresent
Signal that the reference script input has an inline datum. **Alias of `txInInlineDatumPresent()`** — both are equivalent.

```typescript
spendingReferenceTxInInlineDatumPresent(): this
```

### spendingReferenceTxInRedeemerValue
Provide redeemer for a reference script input. **Alias of `txInRedeemerValue()`** — both are equivalent.

```typescript
spendingReferenceTxInRedeemerValue(
  redeemer: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh",
  exUnits: { mem: number, steps: number } = DEFAULT_REDEEMER_BUDGET
): this
```

### simpleScriptTxInReference
Use a native (simple) script reference.

```typescript
simpleScriptTxInReference(
  txHash: string,
  txIndex: number,
  spendingScriptHash?: string,
  scriptSize?: string
): this
```

---

## Scripts - Minting

### mintPlutusScript / mintPlutusScriptV1 / V2 / V3
Signal that the next `mint()` uses a Plutus minting policy.

```typescript
// Dynamic version
mintPlutusScript(languageVersion: LanguageVersion): this

// Static shortcuts
mintPlutusScriptV1(): this
mintPlutusScriptV2(): this
mintPlutusScriptV3(): this
```

### mint
Add a minting operation.

```typescript
mint(
  quantity: string,  // Amount to mint (negative to burn)
  policy: string,    // Policy ID
  name: string       // Asset name (hex-encoded)
): this
```

### mintingScript
Provide the minting policy script CBOR.

```typescript
mintingScript(scriptCBOR: string): this
```

### mintTxInReference
Use a reference script for minting (Plutus only).

```typescript
mintTxInReference(
  txHash: string,
  txIndex: number,
  scriptSize?: string,
  scriptHash?: string
): this
```

### mintReferenceTxInRedeemerValue
Provide redeemer for minting (primary method).

```typescript
mintReferenceTxInRedeemerValue(
  redeemer: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh",
  exUnits: { mem: number, steps: number } = DEFAULT_REDEEMER_BUDGET
): this
```

### mintRedeemerValue
Provide redeemer for minting. **Alias of `mintReferenceTxInRedeemerValue()`** — both are equivalent.

```typescript
mintRedeemerValue(
  redeemer: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh",
  exUnits: { mem: number, steps: number } = DEFAULT_REDEEMER_BUDGET
): this
```

---

## Scripts - Withdrawal

### withdrawalPlutusScript / withdrawalPlutusScriptV1 / V2 / V3
Signal that the next `withdrawal()` uses a Plutus script.

```typescript
// Dynamic version
withdrawalPlutusScript(languageVersion: LanguageVersion): this

// Static shortcuts
withdrawalPlutusScriptV1(): this
withdrawalPlutusScriptV2(): this
withdrawalPlutusScriptV3(): this
```

### withdrawal
Withdraw staking rewards.

```typescript
withdrawal(
  rewardAddress: string,  // bech32 stake address (stake_xxx)
  coin: string            // Amount in lovelace
): this
```

### withdrawalScript
Provide withdrawal script CBOR.

```typescript
withdrawalScript(scriptCbor: string): this
```

### withdrawalTxInReference
Use a reference script for withdrawal.

```typescript
withdrawalTxInReference(
  txHash: string,
  txIndex: number,
  scriptSize?: string,
  scriptHash?: string
): this
```

### withdrawalRedeemerValue
Provide redeemer for script withdrawal.

```typescript
withdrawalRedeemerValue(
  redeemer: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh",
  exUnits: { mem: number, steps: number } = DEFAULT_REDEEMER_BUDGET
): this
```

---

## Scripts - Voting

### votePlutusScript / votePlutusScriptV1 / V2 / V3
Signal that the next `vote()` uses a Plutus script.

```typescript
// Dynamic version
votePlutusScript(languageVersion: LanguageVersion): this

// Static shortcuts
votePlutusScriptV1(): this
votePlutusScriptV2(): this
votePlutusScriptV3(): this
```

### vote
Add a governance vote.

```typescript
vote(
  voter: Voter,           // { type: "DRep" | "StakingPool" | "ConstitutionalCommittee", ... }
  govActionId: RefTxIn,   // { txHash, txIndex }
  votingProcedure: VotingProcedure  // { vote: "Yes" | "No" | "Abstain", anchor? }
): this
```

### voteScript
Provide voting script CBOR.

```typescript
voteScript(scriptCbor: string): this
```

### voteTxInReference
Use a reference script for voting.

```typescript
voteTxInReference(
  txHash: string,
  txIndex: number,
  scriptSize?: string,
  scriptHash?: string
): this
```

### voteRedeemerValue
Provide redeemer for script vote.

```typescript
voteRedeemerValue(
  redeemer: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh",
  exUnits: { mem: number, steps: number } = DEFAULT_REDEEMER_BUDGET
): this
```

---

## Staking Certificates

### registerStakeCertificate
Register a stake address.

```typescript
registerStakeCertificate(rewardAddress: string): this
```

### deregisterStakeCertificate
Deregister a stake address (reclaim deposit).

```typescript
deregisterStakeCertificate(rewardAddress: string): this
```

### delegateStakeCertificate
Delegate stake to a pool.

```typescript
delegateStakeCertificate(
  rewardAddress: string,  // bech32 stake address
  poolId: string          // Pool ID (bech32 or hex)
): this
```

### registerPoolCertificate
Register a stake pool.

```typescript
registerPoolCertificate(poolParams: PoolParams): this
```

### retirePoolCertificate
Retire a stake pool.

```typescript
retirePoolCertificate(
  poolId: string,
  epoch: number  // Epoch when retirement takes effect
): this
```

### certificateScript
Add script witness to certificate.

```typescript
certificateScript(
  scriptCbor: string,
  version?: "V1" | "V2" | "V3"  // undefined = Native script
): this
```

### certificateTxInReference
Use reference script for certificate.

```typescript
certificateTxInReference(
  txHash: string,
  txIndex: number,
  scriptSize?: string,
  scriptHash?: string,
  version?: "V1" | "V2" | "V3"
): this
```

### certificateRedeemerValue
Provide redeemer for script certificate.

```typescript
certificateRedeemerValue(
  redeemer: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh",
  exUnits: { mem: number, steps: number } = DEFAULT_REDEEMER_BUDGET
): this
```

---

## Governance (Conway Era)

### drepRegistrationCertificate
Register as a DRep (Delegated Representative).

```typescript
drepRegistrationCertificate(
  drepId: string,           // bech32 DRep ID (drep1xxx)
  anchor?: Anchor,          // { anchorUrl, anchorDataHash }
  coin: string = "500000000000"  // 500 ADA deposit
): this
```

### drepDeregistrationCertificate
Unregister as DRep (reclaim deposit).

```typescript
drepDeregistrationCertificate(
  drepId: string,
  coin: string = "500000000000"
): this
```

### drepUpdateCertificate
Update DRep metadata.

```typescript
drepUpdateCertificate(
  drepId: string,
  anchor?: Anchor
): this
```

### voteDelegationCertificate
Delegate voting power to a DRep.

```typescript
voteDelegationCertificate(
  drep: DRep,               // DRep to delegate to
  rewardAddress: string     // Your stake address
): this
```

### proposal
Create a governance proposal.

```typescript
proposal(
  governanceAction: GovernanceAction,
  anchor: Anchor,
  rewardAccount: RewardAddress,
  deposit: string = "100000000000"  // 100k ADA
): this
```

### proposalScript
Add Plutus script witness to proposal.

```typescript
proposalScript(
  scriptCbor: string,
  version: "V1" | "V2" | "V3"
): this
```

### proposalTxInReference
Use reference script for proposal.

```typescript
proposalTxInReference(
  txHash: string,
  txIndex: number,
  scriptSize: string,
  scriptHash: string,
  version: "V1" | "V2" | "V3"
): this
```

### proposalRedeemerValue
Provide redeemer for script proposal.

```typescript
proposalRedeemerValue(
  redeemer: BuilderData["content"],
  type: "Mesh" | "JSON" | "CBOR" = "Mesh",
  exUnits: { mem: number, steps: number } = DEFAULT_REDEEMER_BUDGET
): this
```

---

## Transaction Configuration

### changeAddress
Set the address to receive change (REQUIRED for `complete()`).

```typescript
changeAddress(addr: string): this
```

### invalidBefore
Transaction valid only after this slot.

```typescript
invalidBefore(slot: number): this
```

### invalidHereafter
Transaction valid only before this slot.

```typescript
invalidHereafter(slot: number): this
```

### requiredSignerHash
Require a specific signer.

```typescript
requiredSignerHash(pubKeyHash: string): this
```

### metadataValue
Add transaction metadata.

```typescript
metadataValue(
  label: number | bigint | string,
  metadata: Metadatum | object
): this
```

### signingKey
Add a signing key for offline signing.

```typescript
signingKey(skeyHex: string): this
```

### selectUtxosFrom
Provide UTxOs for automatic coin selection.

```typescript
selectUtxosFrom(extraInputs: UTxO[]): this
```

### protocolParams
Override protocol parameters.

```typescript
protocolParams(params: Partial<Protocol>): this
```

### setNetwork
Set the network for cost model lookup.

```typescript
setNetwork(network: "testnet" | "preview" | "preprod" | "mainnet"): this
```

### setFee
Manually set transaction fee.

```typescript
setFee(fee: string): this
```

### setTotalCollateral
Set total collateral amount.

```typescript
setTotalCollateral(collateral: string): this
```

### setCollateralReturnAddress
Set collateral return address (defaults to change address).

```typescript
setCollateralReturnAddress(address: string): this
```

### chainTx
Add a chained (not yet on-chain) transaction for evaluation.

```typescript
chainTx(txHex: string): this
```

### inputForEvaluation
Provide UTxO data for offline evaluation.

```typescript
inputForEvaluation(input: UTxO): this
```

---

## Completion Methods

### complete
Build balanced transaction with automatic coin selection and fee calculation.

```typescript
async complete(customizedTx?: Partial<MeshTxBuilderBody>): Promise<string>
```

**Returns:** Transaction hex (unsigned)

**Requirements:**
- `changeAddress()` must be set
- `selectUtxosFrom()` should provide UTxOs for selection
- `fetcher` needed if input info is incomplete

### completeSync
Synchronous build (no balancing).

```typescript
completeSync(customizedTx?: MeshTxBuilderBody): string
```

### completeUnbalanced
Build without balancing (async).

```typescript
completeUnbalanced(customizedTx?: MeshTxBuilderBody): string
```

### completeUnbalancedSync
Build without balancing (sync).

```typescript
completeUnbalancedSync(customizedTx?: MeshTxBuilderBody): string
```

### completeSigning
Add signatures to the transaction.

```typescript
completeSigning(): string
```

**Returns:** Signed transaction hex

### submitTx
Submit transaction to the blockchain.

```typescript
async submitTx(txHex: string): Promise<string | undefined>
```

**Returns:** Transaction hash

---

## Utility Methods

### reset
Clear all builder state.

```typescript
reset(): void
```

### txHex
Property containing the last built transaction hex.

```typescript
txBuilder.txHex: string
```

### calculateFee
Calculate transaction fee.

```typescript
calculateFee(): bigint
```

### getSerializedSize
Get transaction size in bytes.

```typescript
getSerializedSize(): number
```

### getTotalExecutionUnits
Get total script execution units.

```typescript
getTotalExecutionUnits(): { memUnits: bigint, stepUnits: bigint }
```

---

## TxParser

Parse transaction hex strings for manipulation or testing.

```typescript
import { TxParser } from '@meshsdk/transaction';

const parser = new TxParser(serializer, fetcher?);

// Parse transaction
const builderBody = await parser.parse(txHex, providedUtxos?);

// Get parsed body
parser.getBuilderBody();

// Get body without change output
parser.getBuilderBodyWithoutChange();

// Get test representation
parser.toTester();
```

---

## Type Reference

### Asset
```typescript
interface Asset {
  unit: string;      // "lovelace" or policyId + assetName
  quantity: string;  // Amount as string
}
```

### UTxO
```typescript
interface UTxO {
  input: {
    txHash: string;
    outputIndex: number;
  };
  output: {
    address: string;
    amount: Asset[];
    dataHash?: string;
    plutusData?: string;
    scriptRef?: string;
    scriptHash?: string;
  };
}
```

### Voter
```typescript
type Voter =
  | { type: "ConstitutionalCommittee"; hotCred: Credential }
  | { type: "DRep"; drepId: string }
  | { type: "StakingPool"; keyHash: string }
```

### VotingProcedure
```typescript
interface VotingProcedure {
  vote: "Yes" | "No" | "Abstain";
  anchor?: Anchor;
}
```

### Anchor
```typescript
interface Anchor {
  anchorUrl: string;
  anchorDataHash: string;
}
```
