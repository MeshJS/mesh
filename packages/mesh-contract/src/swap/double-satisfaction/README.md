# Warning

This contract is part of the list of Bad Contracts, whose purpose is to serve as learning resources for developers, and help developers to better understand how smart contracts work and improves their ability to fix bad contracts.

- It is covered as one of the guest lectures in Gimbalabs' AikenPBL - https://www.youtube.com/watch?v=JgIhzix7rMo

# Double Satisfaction Vulnerability

This is a vulnerability where a bad actor can unlock multiple script utxos by fulfilling less than intented criteria. This swap example illustrate this vulnerability by not checking there is only 1 script input. It leads to bad actors can extract more value than it was expected from the protocol.
