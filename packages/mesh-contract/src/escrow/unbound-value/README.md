# Warning

This contract is part of the list of Bad Contracts, whose purpose is to serve as learning resources for developers, and help developers to better understand how smart contracts work and improves their ability to fix bad contracts.

- It is covered as one of the guest lectures in Gimbalabs' AikenPBL - https://www.youtube.com/watch?v=IQoN6yL3z1A

# Unbound value

Unbound value is a vulnerability where the hackers can spam the application by providing excessive unnecessary tokens in a validator, causing permanent lock of value in validator due to protocol limitation of execution units. In the escrow example, we did not specificallly guard this scenario since it did not make economical sense for both initiator and recipient to perform such hack. However, it other application or scenario it may be required to specifically check the length of input / output to prevent such hack from happening.
