# Warning

This contract is part of the list of Bad Contracts, whose purpose is to serve as learning resources for developers, and help developers to better understand how smart contracts work and improves their ability to fix bad contracts.

- It is covered as one of the guest lectures in Gimbalabs' AikenPBL - https://www.youtube.com/watch?v=IQoN6yL3z1A

# Locked value

Locked value is a design where the application would cause permanent lock of value alike burning value permenantly. It will cause loss of fund and value circulation. However, in some scenarios it might be a intented behaviour to produce umtamperable utxos to serve as single proven source of truth for DApps. One should consider the economics and tradeoff against the design choice. In the plutus nft example, locked value vulnerability is not considered as severe since only around 2 ADA would be permenantly lock in oracle.
