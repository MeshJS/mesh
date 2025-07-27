import { HydraController } from "./hydra-controller";

const controller = new HydraController();

controller.on("*", (snapshot) => {
  console.log("New state:", snapshot.value);
});

// Wait for specific compound state like Connected.Idle
controller.on("Connected.Idle", () => {
  console.log("Hydra is now connected and idle, sending Init...");
  controller.init();
});

// Connect to the Hydra node
controller.start();
controller.connect({
  baseURL: "http://localhost:4001",
  address: "addr_test1vp5cxztpc6hep9ds7fjgmle3l225tk8ske3rmwr9adu0m6qchmx5z",
  snapshot: true,
  history: true,
});

controller.waitFor("Connected.Initializing.ReadyToCommit").then(() => {
  console.log("Ready to commit, sending commit data...");
  controller.commit({});
});
