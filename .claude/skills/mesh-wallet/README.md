# Wallet Skill

AI assistant skill for Cardano wallet integration with `@meshsdk/wallet`.

Part of [@meshsdk/ai-skills](../README.md).

## Coverage

- MeshCardanoBrowserWallet - CIP-30 browser wallet connection
- MeshCardanoHeadlessWallet - Server-side wallet from mnemonic/keys
- CardanoSigner - Low-level signing utilities
- InMemoryBip32 - BIP32 key derivation
- Common patterns and error solutions

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Main entry - overview, quick reference |
| `WALLET.md` | Complete API documentation |
| `PATTERNS.md` | Common wallet recipes with code |
| `TROUBLESHOOTING.md` | Error solutions and debugging |

## Example Prompts

- "How do I connect to a browser wallet?"
- "Create a headless wallet from mnemonic"
- "How do I sign a transaction with Mesh?"
- "Sign data for authentication (CIP-8)"
- "Why am I getting 'User declined to sign'?"
- "Show me how to get wallet balance"

## Related Packages

- `@meshsdk/wallet` - The SDK package this skill documents
- `@meshsdk/core` - Full SDK (includes wallet + transaction + provider)
- `@meshsdk/transaction` - Transaction building (see transaction skill)

## License

Apache-2.0
