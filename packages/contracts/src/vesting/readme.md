# Vesting

Vesting contract is a smart contract that locks up funds for a period of time and allows the owner to withdraw the funds after the lockup period.

Actors:
- owner
  - owner is the organization that is depositing funds into the vesting contract
  - owner deposit funds to be locked up for a period of time
  - ? owner can withdraw funds if it is not redeemed after a certain time after the lockup period
  - ? owner can cancel the lockup period if someone leaves the organization
- beneficiary
  - beneficiary is the recipient of the locked up funds
  - beneficiary can withdraw funds after the lockup period

Story:
when a new employee join an organization, they are promised an amount of money to be paid after a period of time. The organization can deposit the funds into a vesting contract and the employee can withdraw the funds after the lockup period. this is to ensure that the employee stays with the organization for a period of time.

Endpoints:
- owner deposit funds
- withdraw funds

Reference: 
- https://aiken-lang.org/example--vesting
