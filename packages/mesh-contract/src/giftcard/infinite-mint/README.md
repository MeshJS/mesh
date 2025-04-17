# Warning

This contract is part of the list of Bad Contracts, whose purpose is to serve as learning resources for developers, and help developers to better understand how smart contracts work and improves their ability to fix bad contracts.

- It is covered as one of the guest lectures in Gimbalabs' AikenPBL - https://www.youtube.com/watch?v=IQoN6yL3z1A

# Infinite mint

## Vulnerability mechanism

Infinite mint is a vulnerability where there is no strict restriction on minting a particular policy where malicious players can mint more than desired tokens from one transaction. Normally it comes from when the validator checks against whether a particular token has been minted without strictly prohibiting other tokens from minting.

## Way of exploit

This vulnerability is dangerous when a complex application relies on certain policy ID for authentication, while malicious players can produce uncontrolled circulation of token with that policy ID, leading to complex hacking scenarios causing loss of funds. In the [giftcard example](./validators/oneshot.ak), we didn't guard other minting value except for the gift card token leading to this vulnerability.

```rs
# No check in output value length
expect Some(Pair(asset_name, amount)) =
  mint
    |> assets.tokens(policy_id)
    |> dict.to_pairs()
    |> list.find(fn(Pair(asset_name, _)) { asset_name == token_name })
```

Test case of exploit:
![alt text](vulnerabiltiy_test.png)

## Fix the vulnerability

Fixing the vulnerability is easy by limiting minting value, demonstrating in the [giftcard contract](../aiken-workspace-v2/validators/oneshot.ak).

```rs
# In scripts, we pattern match exactly one mint from current tx.
expect [Pair(asset_name, amount)] =
  mint
    |> assets.tokens(policy_id)
    |> dict.to_pairs()
```
