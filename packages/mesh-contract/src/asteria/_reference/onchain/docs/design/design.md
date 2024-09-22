# Asteria dApp Design

## Introduction

This document describes the technical design of the Asteria dApp - the script UTxOs involved, the operations that take place both during the game and in the setup phase, and the necessary validators and minting policies.

There will be a single `AsteriaUtxo`, several `PelletState` UTxOs and a `ShipState` UTxO for every user. The `AsteriaUtxo` locks the ada amount paid by each user when creating a ship, and it's position on the board is always assumed to be (0,0). Both `PelletState` and `ShipState` UTxOs have their positions specified in the datum. In order to identify valid game UTxOs, the admin will deposit a special token (the `AdminToken`) in the `PelletState` UTxOs and the `AsteriaUtxo` when creating them. This token is also used for parameterizing the Asteria, Pellet and Spacetime validators, so we could have different "versions" of the game, each one with a different `AdminToken`.

Each ship will be identified by a `ShipToken`, with a fixed policy id but a token name of their own. This is the token that is minted by the `ShipyardPolicy`, described in the validators section.

## Constants Glossary

- `MAX_SPEED`: maximum speed allowed for ship's movement.
- `INITIAL_FUEL`: ship's fuel upon creation.
- `MAX_SHIP_FUEL`: ship's fuel capacity.
- `FUEL_PER_STEP`: fuel spent per distance unit.
- `MAX_ASTERIA_MINING`: maximum percentage that can be obtained from the rewards accumulated when a ship reaches Asteria. Must be an integer between 0 and 100.
- `MIN_ASTERIA_DISTANCE`: ship's minimum distance to Asteria upon creation.
- `SHIP_MINT_LOVELACE_FEE`: amount of Lovelace that users have to pay to create a ship.

## UTxOs specification

### ShipState UTxO

>#### Address
>
>- Parameterized on `AdminToken`, Asteria validator address, pellet validator address, MAX_SPEED, MAX_SHIP_FUEL, FUEL_PER_STEP, INITIAL_FUEL and MIN_ASTERIA_DISTANCE. The validator corresponding to this address is in `spacetime.ak`.
>
>#### Datum
>
>- pos_x: **Int**
>- pos_y: **Int**
>- ship_token_name: **AssetName**
>- pilot_token_name: **AssetName**
>- last_move_latest_time: **PosixTime**
>
>#### Value
>
>- minADA
>- `ShipToken`
>- fuel tokens.

### PelletState UTxO

>#### Address
>
>- Parameterized on the `AdminToken`.
>
>#### Datum
>
>- pos_x: **Int**
>- pos_y: **Int**
>- shipyard_policy: **PolicyId**
>
>#### Value
>
>- minADA
>- `AdminToken`
>- fuel tokens
>- prize tokens

### Asteria Utxo:

>#### Address
>
>- Parameterized on the `AdminToken`, SHIP_MINT_LOVELACE_FEE, MAX_ASTERIA_MINING.
>
>#### Datum
>
>- ship_counter: **Int**
>- shipyard_policy: **PolicyId**
>
>#### Value
>
>- total rewards (ADA)
>- `AdminToken`
>
>Note: the reward amount is updated during the course of the game, whenever a new user joins or reaches Asteria.

## Transactions

### Create Asteria UTxO

This transaction creates the unique `AsteriaUtxo` locking min ada and an `AdminToken`. It stores in the datum the `ShipToken` policy id for being able to reference it in the validator.

![createAsteria diagram](img/createAsteria.png)

### Create a PelletState UTxO

Creates one `PelletState` UTxO locking min ada, an `AdminToken`, fuel tokens and some extra tokens ("prize tokens") that ship owners can retrieve besides gathering fuel when they reach the pellet. Also sets the `pos_x` and `pos_y` datum coordinates where the pellet will be located on the grid, and the `shipyard_policy` field as the `ShipToken` policy id, for being able to reference it in the validator.

![createPellet diagram](img/createPellet.png)

### Create a ShipState UTxO

Creates a `ShipState` UTxO locking min ada, a `ShipToken` (minted in this tx) and an `INITIAL_FUEL` amount of fuel tokens (minted in this tx), specifying in the datum the initial `pos_x` and `pos_y` coordinates of the ship, the ship and pilot token names and the `last_move_latest_time` as the upper bound of the transaction's validity range (posix time). Also adds to the `AsteriaUTxO` value the `SHIP_MINT_LOVELACE_FEE` paid by the user.

![createShip diagram](img/createShip.png)

### Move a Ship

Updates the `pos_x`, `pos_y` and `fuel` datum fields of the `ShipState` UTxO by adding the `delta_x` and `delta_y` values specified in the redeemer, and subtracts from the ship value the amount of fuel tokens needed for the displacement (which are burnt in this tx). Also updates the `last_move_latest_time` field with the transaction's validity range latest posix time.

![moveShip diagram](img/moveShip.png)

### Gather Fuel

Updates the amount of fuel tokens in both `ShipState` and `PelletState` UTxOs, adding the `amount` (specified in the redeemer) from the first and subtracting it from the latter. Also allows the ship owner to get any amount of the prize tokens held in the pellet.

![gatherFuel diagram](img/gatherFuel.png)

### Mine Asteria UTxO

Subtracts from the `AsteriaUTxO` at most `MAX_ASTERIA_MINING`% of the ada value, and pays that amount to the owner of the ship that reached Asteria, together with the min ada locked in the `ShipState` UTxO. The `ShipToken` and the remaining fuel tokens are burnt.

![mineAsteria diagram](img/mineAsteria.png)

### Quit Game

Pays the min ada locked in the `ShipState` UTxO back to the ship owner. Also burns the `ShipToken` and the remaining fuel tokens.

![quit diagram](img/quit.png)

### Consume Asteria UTxO

Pays the admin the value locked in the `AsteriaUtxo`.

![consumeAsteria diagram](img/consumeAsteria.png)

### Consume PelletState UTxO

Pays the admin the value locked in the `PelletState` UTxO and burns the remaining fuel tokens.

![consumePellet diagram](img/consumePellet.png)

## Validators & Minting Policies

### Asteria validator

- Params: `AdminToken`, `SHIP_MINT_LOVELACE_FEE` and `MAX_ASTERIA_MINING`.

#### *AddNewShip Redeemer*

- `AsteriaUTxO` output value equals input value plus the `SHIP_MINT_LOVELACE_FEE`.
- `AdminToken` is in the output `AsteriaUTxO`.
- datum `ship_counter` field is incremented by 1.
- datum `shipyard_policy` field is not changed.

#### *Mine Redeemer*

- `ShipToken` is present in some input.
- `AsteriaUTxO` output value has at most `MAX_ASTERIA_MINING`% adas less than input value.
- datum doesn't change.

#### *ConsumeAsteria Redeemer*

- `AdminToken` is present in some wallet input.

## Pellet Multivalidator

Includes the Pellet validator and the Fuel policy.

### Pellet validator

- Params: `AdminToken`.

#### *Provide Redeemer (includes gathering amount)*

- `ShipToken` is present in some input.
- the admin token is present in the output `PelletState`.
- the specified amount is not greater than the fuel available in the pellet.
- the specified amount of fuel tokens is subtracted from the output `PelletState` value.
- the datum is preserved.

#### *ConsumePellet Redeemer*

- `AdminToken` is present in some wallet input.

### Fuel policy

- Params: same as Pellet validator.

#### *MintFuel Redeemer*

- `AdminToken` is present in some input.
- some amount of tokens with name "FUEL" are minted.

#### *BurnFuel Redeemer*

- some amount of tokens with name "FUEL" are burnt.

## Ship Multivalidator

Includes the Spacetime validator and the Shipyard policy.

### SpaceTime validator

- Params: `AdminToken`, Asteria validator address, pellet validator address, MAX_SPEED, MAX_SHIP_FUEL, FUEL_PER_STEP, INITIAL_FUEL and MIN_ASTERIA_DISTANCE.

#### *MoveShip Redeemer (includes delta_x and delta_y displacements)*

- the `ShipState` input is the only script input.
- there is a single `ShipState` output.
- the `PilotToken` is present in an input.
- the `ShipState` output value only has the `ShipToken`, some fuel tokens and some amount of ada.
- the `ShipState` input has enough fuel to move the desired delta.
- the distance advanced divided by the tx validity range (posix time) doesn't exceed the maximum speed.
- the `ShipState` input `last_move_latest_time` datum field is not greater than the earliest posix time of the tx validity range.
- the output `ShipState` fuel tokens amount equals the input minus the amount of fuel required for the displacement.
- the spent fuel tokens are burnt.
- the `pos_X` and `pos_y` output datum values are updated as the previous ones (input values) plus the corresponding deltas.
- the output `last_move_latest_time` datum field is set as the latest posix time of the tx validity range.
- the `pilot_token` datum field is not changed.
- the `ShipToken` is present in the output `ShipState`.

#### *GatherFuel Redeemer (includes gathering amount)*

- there are two script inputs: `ShipState` and `PelletState`.
- there is a single `ShipState` output.
- `PilotToken` is present in the inputs.
- the `PelletState` input has the same x and y datum coordinates as the `ShipState` UTxO.
- the `ShipState` output value only has the `ShipToken`, some amount of ada and some fuel tokens.
- the amount specified of fuel tokens is added to the output `ShipState` value.
- the amount specified plus the fuel before charging does not exceed `MAX_SHIP_FUEL` capacity.
- `ShipState` datum's `last_move_latest_time` is not greater than the earliest posix time of the tx validity range.
- the datum is preserved.
- the `ShipToken` is present in the output `ShipState`.
- no tokens are minted.

#### *MineAsteria Redeemer*

- there are two script inputs: `ShipState` and `AsteriaUTxO`.
- `PilotToken` is present in the inputs.
- `ShipState` position is (0,0).
- `ShipToken` is burnt.
- fuel tokens are burnt.
- `ShipState` datum's `last_move_latest_time` is not greater than the earliest posix time of the tx validity range.

#### *Quit Redeemer*

- the `ShipState` input is the only script input.
- the `PilotToken` is present in an input.
- `ShipToken` is burnt.
- fuel tokens are burnt.

### Shipyard policy

- Params: same as SpaceTime validator.

#### *MintShip Redeemer*

- `AsteriaUTxO` is input.
- three assets are minted: 1 `ShipToken` (shipyard policy), 1 `PilotToken` (shipyard policy) and an `INITIAL_FUEL` amount of fuel tokens (fuel policy).
- the name of the `ShipToken` is the `ship_counter` of the `AsteriaUTxO` datum appended to the string `SHIP`.
- the name of the `PilotToken` is the `ship_counter` of the `AsteriaUTxO` datum appended to the string `PILOT`.
- there is a single `ShipState` output.
- the `ShipState` output datum has x and y coordinates such that distance from (0,0) is above MIN_ASTERIA_DISTANCE.
- the `ShipState` output datum has the `ship_token_name` set as the name of the `ShipToken`.
- the `ShipState` output datum has the `pilot_token_name` set as the name of the `PilotToken`.
- the `ShipState` output datum has the `last_move_latest_time` set as the latest posix time of the tx validity range.
- the `ShipState` output value only has the `ShipToken`, the `INITIAL_FUEL` amount of fuel tokens and some amount of ada.

#### *BurnShip Redeemer*

- only one token with this policy id is burnt.
