# Game Rules

## Meta Overview

- Asteria is a Cardano bot challenge to showcase the capabilities of the eUTxO model. In particular, it's concurrency benefits.
- Developers can participate by building their own bots (automated agents) that interact directly with the Cardano blockchain.
- Each bot can be defined as an off-chain process that controls particular UTxOs that are constrained by on-chain validators.
- Once the challenge has been layed out by the administrators, all following interactions and rewards are fully decentralized.

## Game Overview

- Your bot is in charge of controlling a (space) ship that moves in a 2D grid.
- The goal is to reach coordinates (0, 0) allowing the rewards of the challenge to be claimed.
- Your movement is constrained by a maximum speed and the availability of a fuel resource.
- Fuel is freely available at fixed coordinates in the grid, ships can gather the fuel if their coordinates overlap.

## Components

### Grid

- the grid is a virtual space in 2 dimensions (`x`, `y`).
- there's no on-chain representation of the grid
- coordinates on each dimension are discrete (integer values)
- the coordinates `(0, 0)` are considered the center of the grid

### Ship

- a ship is identified by a Cardano native asset token of a specific policy id. We call this class of token `ShipToken`.
- the UTxO that holds the `ShipToken` defines the state of the ship. We call this class of UTxOs `ShipState`.
- the datum of the `ShipState` UTxO contains information about current coordinates and available fuel.
- all `ShipState` UTxOs belong to a script address that constraints changes that can be applies to the state. We call this script `SpaceTimeScript`.

```js
// ShipState
{
    assets: {
        [SHIP_MINT_POLICY]: {
            [$ShipName]: 1
        }
    },
    datum: {
        pos_x: Int, // x coordinate of the current position
        pos_y: Int, // y coordinate of the current position
        pos_ts: PosixTime, // timestamp of last movement
        fuel: Int // total amount of available fuel
    }
}
```

> ::question::
> should we handle fuel as part of the datum or rely on a native token? 

> ::question::
> what's the best way to track / store the position timestamp?

### Pilot

- the pilot is a Cardano native token from a particular policy id that is locked in an address managed by the participant. We call this class of token `PilotToken`.
- the goal of this token is to ensure that changes to the `ShipState` are triggered by the rightful owner of the ship.
- the pilot token needs to be present in any of the inputs of a transaction that progresses the state of the ship.

### Fuel Pellet

- a fuel pellet is freely available source of fuel tokens that are located at a fixed position in the grid.
- a fuel pellet is represented by a UTxO that contains any amount of `FuelToken` and is locked at a specific script address. We call this class of UTxO `PelletState`
- the datum of a `PelletState` defines the position of the pellet within the _grid_.
- the amount of fuel tokens in the `PelletState` represents the available fuel.


```js
// PelletState
{
    assets: {
        [FUEL_TOKEN_POLICY]: {
            fuel: $available_amount
        }
    },
    datum: {
        pos_x: Int, // x coordinate of the current position
        pos_y: Int, // y coordinate of the current position
    }
}
```

### Asteria

- Asteria is an asteroid located at the center of the grid that represents the end goal of the challenge.
- Asteria is represented by an UTxO that called `AsteriaUtxo`. 
- This UTxO will hold the aggregated rewards of the challenge.
- This UTxO holds a datum with a counter that controls a sequence used to enforce ship uniqueness.

```js
// AsteriaUtxo
{
    assets: {
        lovelace: $total_rewards
    },
    datum: {
        ship_counter: Int, // a counter of ships participating
    }
}
```

## Gameplay

### Building a ship

- to create a ship, the participant has to mint a new `ShipToken` and matching `PilotToken` through a mint validator called `ShipyardPolicy`.
- each Pilot / Ship token pair will be unique. The validator will ensure uniqueness by incrementing a "counter" datum locked in the `AsteriaUtxo`.
- the asset name of the `ShipToken` and `PilotToken` will contain the counter value as a suffix. Eg: `SHIP23` and `PILOT23`.
- the `ShipToken` needs to be locked in the `SpaceTimeScript` and the `PilotToken` needs to go to an address controlled by the participant.
- the mint process will require locking an ADA payment adding to the reward pot. The amount of this payment is defined by our constant `SHIP_MINT_FEE`.

> ::question:: do we need some sort of admin keys for the mint? or are we ok with making this a fully decentralized process?

> ::info:: this process is subject to contention because two transactions may require the same `AsteriaUtxo`.

### Moving your ship

- movement of a ship through the grid is achieved by a transaction the consumes the `ShipState` UTxO and outputs a new one with the updated state.
- the maximum _distance_ that can be achieved in a single transaction is constrained by the constant `MAX_SHIP_MOVEMENT_PER_TX`.
- moving the ship will consume a quantity of fuel proportional to the distance. The ratio of fuel required per distance unit is defined by the constant `FUEL_PER_DISTANCE_UNIT`.

### Gathering fuel

- gathering fuel is achieved by a transaction that consumes the `ShipUtxo` and a `PelletUtxo` and outputs a new `ShipUtxo` with increased fuel value.
- to consume a fuel pellet, the position of the ship must overlap with the position of the pellet.
- the total amount of fuel that ship has can't exceed the `MAX_SHIP_FUEL` parameter.
- if the fuel pellet isn't totally consumed, a new `PelletUtxo` needs to be generated with the remaining of the fuel and maintaining the same location in the grid.

### Mining Asteria

- this action is achieved by a transaction that consumes the `ShipUtxo` and `AsteriaUtxo` and outputs a new one that extracts assets from the `AsteriaUtxo` into a wallet defined by the participant.
- the amount of assets that can be extracted from the `AsteriaUtxo` must not exceed a percentage of the total available defined by the `MAX_ASTERIA_MINING`.
- to execute this action, the `ShipUtxo` must be present at coordinates `(0, 0)`.

> ::question:: how do we restrict participants from repeating the mining action several times? The simple way would be to burn the ShipUtxo as part of the tx. Is there a better alternative? Something that allows the participant to retain the ShipToken in its wallet?

## Glossary

- **Distance**: in the context of Asteria, the distance between two coordinates of a the grid is computed using [Manhattan distance](https://en.wikipedia.org/wiki/Taxicab_geometry).
