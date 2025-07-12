import { createActor } from "xstate";
import { machine } from "./hydra-machine";

// Create an actor instance
const hydraActor = createActor(machine, {
  id: "hydra-machine",
});

// Start the actor
hydraActor.start();

// Example: Connect to a Hydra Head server
hydraActor.send({
  type: "Connect",
  baseURL: "http://localhost:4001",
});

// Example: Initialize a Head
hydraActor.send({ type: "Init" });

// Example: Commit UTxOs
hydraActor.send({
  type: "Commit",
  data: {}
});

// Example: Send a new transaction
hydraActor.send({
  type: "NewTx",
  tx: { /* your tx data */ }
});

// Example: Recover or decommit UTxO
hydraActor.send({ type: "Recover", txHash: "txhash123" });
hydraActor.send({ type: "Decommit", tx: "txid456" });

// Example: Close the Head
hydraActor.send({ type: "Close" });

// Example: Contest and Fanout
hydraActor.send({ type: "Contest" });
hydraActor.send({ type: "Fanout" });

// Optional: Subscribe to state changes
hydraActor.subscribe((snapshot) => {
  console.log("Current state:", snapshot.value);
  console.log("Current context:", snapshot.context);
});
