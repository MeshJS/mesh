# Escrow

The escrow contract is a simple contract that allows two parties to agree on a transaction and then have the funds locked until the transaction is complete. The contract is designed to be used in a trustless manner, so that neither party can cheat the other.

Actors:
- initiator
  - initiator is the party that starts the escrow
  - initiator deposit assets into the escrow
- recipient
  - recipient deposit assets into the escrow
- both parties
  - either party can cancel the trade and all assets are returned to the original owner
  - both parties must agree to the trade before the assets are released

Story:
When two parties agree on a transaction, they can deposit assets into the escrow and the recipient can withdraw the assets if the transaction is complete. if the transaction is not complete or canceled, the assets are returned to the original owner.

Endpoints:
- initiator deposit assets
- recipient deposit assets
- cancel trade
- complete trade
list, pay, report, dispute, claim?


Processes:
- initiate -> cancel
- initiaite -> recipient deposit -> initiator cancel
- initiaite -> recipient deposit -> recipient cancel
- initiaite -> recipient deposit -> complete trade
