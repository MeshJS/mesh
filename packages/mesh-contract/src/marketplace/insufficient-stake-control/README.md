# Warning

This contract is part of the list of Bad Contracts, whose purpose is to serve as learning resources for developers, and help developers to better understand how smart contracts work and improves their ability to fix bad contracts.

- It is covered as one of the guest lectures in Gimbalabs' AikenPBL - https://www.youtube.com/watch?v=JgIhzix7rMo

# Insufficient stake control

Insufficient stake control is a vulnerability where the value payment only check against payment key but not checking with a full address. Malicious player can fulfill the validator unlocking logic by sending value to an address with his/her own stake key to steal the staking reward and voting power if the user is not aware of that.
