# Warning

This contract is part of the list of Bad Contracts, whose purpose is to serve as learning resources for developers, and help developers to better understand how smart contracts work and improves their ability to fix bad contracts.

- It is covered as one of the guest lectures in Gimbalabs' AikenPBL - https://www.youtube.com/watch?v=IQoN6yL3z1A

# Infinite mint

Infinite mint is a vulnerability where there is no strict restriction on minting a particular policy where malicious players can mint more than desired tokens from one transaction. Normally it comes from when the validator checks against whether a particular token has been minted without strictly prohibiting other tokens from minting. This vulnerability is dangerous when a complex application relies on certain policy ID for authentication, while malicious players can produce uncontrolled circulation of token with that policy ID, leading to complex hacking scenarios causing loss of funds.
