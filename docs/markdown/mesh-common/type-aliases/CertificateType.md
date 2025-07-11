[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / CertificateType

# Type Alias: CertificateType

> **CertificateType** = \{ `poolParams`: [`PoolParams`](PoolParams.md); `type`: `"RegisterPool"`; \} \| \{ `stakeKeyAddress`: `string`; `type`: `"RegisterStake"`; \} \| \{ `poolId`: `string`; `stakeKeyAddress`: `string`; `type`: `"DelegateStake"`; \} \| \{ `stakeKeyAddress`: `string`; `type`: `"DeregisterStake"`; \} \| \{ `epoch`: `number`; `poolId`: `string`; `type`: `"RetirePool"`; \} \| \{ `drep`: [`DRep`](DRep.md); `stakeKeyAddress`: `string`; `type`: `"VoteDelegation"`; \} \| \{ `drep`: [`DRep`](DRep.md); `poolKeyHash`: `string`; `stakeKeyAddress`: `string`; `type`: `"StakeAndVoteDelegation"`; \} \| \{ `coin`: `number`; `poolKeyHash`: `string`; `stakeKeyAddress`: `string`; `type`: `"StakeRegistrationAndDelegation"`; \} \| \{ `coin`: `number`; `drep`: [`DRep`](DRep.md); `stakeKeyAddress`: `string`; `type`: `"VoteRegistrationAndDelegation"`; \} \| \{ `coin`: `number`; `drep`: [`DRep`](DRep.md); `poolKeyHash`: `string`; `stakeKeyAddress`: `string`; `type`: `"StakeVoteRegistrationAndDelegation"`; \} \| \{ `committeeColdKeyAddress`: `string`; `committeeHotKeyAddress`: `string`; `type`: `"CommitteeHotAuth"`; \} \| \{ `anchor?`: [`Anchor`](Anchor.md); `committeeColdKeyAddress`: `string`; `type`: `"CommitteeColdResign"`; \} \| \{ `anchor?`: [`Anchor`](Anchor.md); `coin`: `number`; `drepId`: `string`; `type`: `"DRepRegistration"`; \} \| \{ `coin`: `number`; `drepId`: `string`; `type`: `"DRepDeregistration"`; \} \| \{ `anchor?`: [`Anchor`](Anchor.md); `drepId`: `string`; `type`: `"DRepUpdate"`; \}

Defined in: types/transaction-builder/certificate.ts:19
