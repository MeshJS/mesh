import { createActor } from "xstate";
import { createHydraMachine } from "../state-management/hydra-machine-refactored";
import { HTTPClient } from "../utils";

// Example 1: Basic usage (same as before)
const basicExample = () => {
  const machine = createHydraMachine();
  const actor = createActor(machine);
  
  actor.start();
  actor.send({ type: "Connect", baseURL: "http://localhost:4001" });
  
  return actor;
};

// Example 2: With custom configuration
const customExample = () => {
  const machine = createHydraMachine({
    webSocketFactory: {
      create: (url) => new WebSocket(url)
    },
    httpClientFactory: {
      create: (baseURL) => {
        // Could add logging, interceptors, etc.
        const { HTTPClient } = require("../utils");
        return new HTTPClient(baseURL);
      }
    }
  });
  
  const actor = createActor(machine);
  actor.start();
  
  return actor;
};

export { basicExample, customExample };
