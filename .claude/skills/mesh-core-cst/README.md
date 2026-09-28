# Core CST Skill

AI assistant skill for low-level Cardano utilities with `@meshsdk/core-cst`.

Part of [@meshsdk/ai-skills](../README.md).

## Coverage

- CardanoSDKSerializer - Transaction serialization to CBOR
- Resolvers - Address, hash, and key resolution functions
- Message Signing - CIP-8 COSE sign and verify
- Plutus Tools - Script parameterization and normalization
- Data Utilities - Plutus data conversion (Mesh/JSON/CBOR)
- Address Utilities - Parse, build, convert addresses
- Re-exports from @cardano-sdk/core

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Main entry - overview, quick reference |
| `CORE-CST.md` | Complete API documentation |
| `PATTERNS.md` | Common usage patterns with code |
| `TROUBLESHOOTING.md` | Error solutions and debugging |

## Example Prompts

- "How do I resolve the payment key hash from an address?"
- "Convert Mesh data to Plutus CBOR"
- "Verify a CIP-8 signature"
- "Apply parameters to a Plutus script"
- "Get the script address from a compiled script"
- "Why am I getting 'Malformed Plutus data json'?"

## When to Use

Use `@meshsdk/core-cst` when you need:
- Low-level control over serialization
- Direct access to cardano-sdk types
- Custom signature verification
- Script parameterization
- Address component manipulation

For most use cases, prefer:
- `@meshsdk/transaction` - For building transactions
- `@meshsdk/wallet` - For wallet integration
- `@meshsdk/core` - For full SDK access

## Related Packages

- `@meshsdk/core-cst` - The SDK package this skill documents
- `@meshsdk/core` - Full SDK (includes core-cst)
- `@cardano-sdk/core` - Underlying Cardano SDK (re-exported)

## License

Apache-2.0
