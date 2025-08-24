import { createActor } from "xstate";
import {
  createHydraMachine,
  WebSocketFactory,
} from "../../src/state-management/hydra-machine";
import WebSocket from "ws";

// WebSocket factory for Node.js environment
// @ts-ignore - Type compatibility between ws and DOM WebSocket
class NodeWebSocketFactory implements WebSocketFactory {
  // @ts-ignore - Type compatibility between ws and DOM WebSocket
  create(url: string): WebSocket {
    const ws = new WebSocket(url);
    // Add missing properties for compatibility
    (ws as any).dispatchEvent = function (event: Event) {
      return true;
    };
    return ws as unknown as WebSocket;
  }
}

const HYDRA_NODES = {
  alice: "http://localhost:4001",
  bob: "http://localhost:4002",
  carol: "http://localhost:4003",
};

function stateToString(value: any): string {
  if (typeof value === "string") return value;
  const obj = value as Record<string, any>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return "";
  const k = keys[0] as keyof typeof obj;
  const v = obj[k];
  return `${k}.${stateToString(v)}`;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForState(
  actor: any,
  targetState: string,
  timeout = 10000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for state: ${targetState}`));
    }, timeout);

    const subscription = actor.subscribe((snapshot: any) => {
      const currentState = stateToString(snapshot.value);
      if (currentState.includes(targetState)) {
        clearTimeout(timer);
        subscription.unsubscribe();
        resolve();
      }
    });
  });
}

describe("Pure Hydra State Machine Integration Tests", () => {
  let aliceActor: any;
  let bobActor: any;
  let carolActor: any;

  beforeAll(async () => {
    // Check if Hydra demo is running
    try {
      const fetch = (global as any).fetch || require("node-fetch");
      await fetch(HYDRA_NODES.alice, { timeout: 5000 });
      await fetch(HYDRA_NODES.bob, { timeout: 5000 });
      await fetch(HYDRA_NODES.carol, { timeout: 5000 });
    } catch (error) {
      throw new Error(
        "Hydra demo is not running. Please run: cd hydra_tmp/demo && ./run-docker.sh",
      );
    }
  });

  beforeEach(() => {
    // Setup Alice
    const aliceMachine = createHydraMachine({
      // @ts-ignore - Type compatibility issue with ws vs DOM WebSocket
      webSocketFactory: new NodeWebSocketFactory(),
    });
    aliceActor = createActor(aliceMachine);

    // Setup Bob
    const bobMachine = createHydraMachine({
      // @ts-ignore - Type compatibility issue with ws vs DOM WebSocket
      webSocketFactory: new NodeWebSocketFactory(),
    });
    bobActor = createActor(bobMachine);

    // Setup Carol
    const carolMachine = createHydraMachine({
      // @ts-ignore - Type compatibility issue with ws vs DOM WebSocket
      webSocketFactory: new NodeWebSocketFactory(),
    });
    carolActor = createActor(carolMachine);

    aliceActor.start();
    bobActor.start();
    carolActor.start();
  });

  afterEach(async () => {
    // Cleanup connections
    const actors = [aliceActor, bobActor, carolActor];

    for (const actor of actors) {
      if (
        actor &&
        stateToString(actor.getSnapshot().value) !== "Disconnected"
      ) {
        actor.send({ type: "Disconnect" });
        await delay(500);
      }
      actor?.stop();
    }
  });

  describe("Basic State Machine Operations", () => {
    test("should connect to single node and receive Greetings", async () => {
      expect(stateToString(aliceActor.getSnapshot().value)).toBe(
        "Disconnected",
      );

      aliceActor.send({
        type: "Connect",
        baseURL: HYDRA_NODES.alice,
        history: true,
        snapshot: false,
      });

      await waitForState(aliceActor, "Connected");
      await delay(2000); // Wait for Greetings

      const snapshot = aliceActor.getSnapshot();
      const state = stateToString(snapshot.value);

      console.log(`Alice final state: ${state}`);

      expect(state).toMatch(/Connected/);
      expect(snapshot.context.client).toBeDefined();
      expect(snapshot.context.connection).toBeDefined();
      expect(snapshot.context.baseURL).toBe(HYDRA_NODES.alice);
    }, 15000);

    test("should connect all three nodes simultaneously", async () => {
      const connections = [
        { actor: aliceActor, url: HYDRA_NODES.alice, name: "Alice" },
        { actor: bobActor, url: HYDRA_NODES.bob, name: "Bob" },
        { actor: carolActor, url: HYDRA_NODES.carol, name: "Carol" },
      ];

      // Connect all simultaneously
      connections.forEach(({ actor, url }) => {
        actor.send({
          type: "Connect",
          baseURL: url,
          history: false,
          snapshot: false,
        });
      });

      // Wait for all to connect
      await Promise.all(
        connections.map(({ actor }) => waitForState(actor, "Connected")),
      );

      await delay(3000); // Wait for handshakes

      // Verify all connections
      connections.forEach(({ actor, url, name }) => {
        const snapshot = actor.getSnapshot();
        const state = stateToString(snapshot.value);

        console.log(`${name} state: ${state}`);

        expect(state).toMatch(/Connected/);
        expect(snapshot.context.client).toBeDefined();
        expect(snapshot.context.connection).toBeDefined();
        expect(snapshot.context.baseURL).toBe(url);
      });
    }, 20000);
  });

  describe("State Machine Message Handling", () => {
    test("should track message flow through state machine", async () => {
      const messages: any[] = [];
      const stateChanges: string[] = [];

      // Capture initial state
      stateChanges.push(stateToString(aliceActor.getSnapshot().value));

      const subscription = aliceActor.subscribe((snapshot: any) => {
        const state = stateToString(snapshot.value);
        if (stateChanges[stateChanges.length - 1] !== state) {
          stateChanges.push(state);
          console.log(`State: ${state}`);
        }

        // Try to capture messages from context
        if (snapshot.context.lastMessage) {
          const msg = snapshot.context.lastMessage;
          if (
            !messages.find((m) => JSON.stringify(m) === JSON.stringify(msg))
          ) {
            messages.push(msg);
            console.log(`Message: ${msg.tag || "Unknown"}`);
          }
        }
      });

      aliceActor.send({
        type: "Connect",
        baseURL: HYDRA_NODES.alice,
        history: true,
        snapshot: false,
      });

      await waitForState(aliceActor, "Connected");
      await delay(3000); // Wait for messages

      subscription.unsubscribe();

      console.log(`Total state changes: ${stateChanges.length}`);
      console.log(`Total messages captured: ${messages.length}`);

      expect(stateChanges.length).toBeGreaterThan(1);
      expect(stateChanges).toContain("Disconnected");
      expect(stateChanges.some((s) => s.includes("Connected.Handshake"))).toBe(
        true,
      );
    }, 15000);

    test("should handle WebSocket commands", async () => {
      aliceActor.send({
        type: "Connect",
        baseURL: HYDRA_NODES.alice,
        history: false,
        snapshot: false,
      });

      await waitForState(aliceActor, "Connected");
      await delay(2000);

      const initialSnapshot = aliceActor.getSnapshot();
      const initialState = stateToString(initialSnapshot.value);

      console.log(`Initial state: ${initialState}`);

      // Test different commands based on current state
      if (initialState.includes("NoHead")) {
        console.log("Testing Init command...");
        aliceActor.send({ type: "Init" });
        await delay(2000);

        const afterInitSnapshot = aliceActor.getSnapshot();
        const afterInitState = stateToString(afterInitSnapshot.value);
        console.log(`After Init: ${afterInitState}`);

        // Should either move to Initializing or stay in NoHead with error
        expect(
          afterInitState.includes("Initializing") ||
            afterInitState.includes("NoHead") ||
            afterInitSnapshot.context.error,
        ).toBeTruthy();
      } else if (initialState.includes("Initializing")) {
        console.log("Head is initializing, testing Abort command...");
        aliceActor.send({ type: "Abort" });
        await delay(2000);

        const afterAbortSnapshot = aliceActor.getSnapshot();
        console.log(`After Abort: ${stateToString(afterAbortSnapshot.value)}`);
      } else if (initialState.includes("Open")) {
        console.log("Head is open, testing Close command...");
        aliceActor.send({ type: "Close" });
        await delay(2000);

        const afterCloseSnapshot = aliceActor.getSnapshot();
        console.log(`After Close: ${stateToString(afterCloseSnapshot.value)}`);
      }

      // Verify actor is still functional
      const finalSnapshot = aliceActor.getSnapshot();
      expect(finalSnapshot.context.connection).toBeDefined();
    }, 20000);
  });

  describe("Advanced State Machine Features", () => {
    test("should handle multiple rapid commands", async () => {
      aliceActor.send({
        type: "Connect",
        baseURL: HYDRA_NODES.alice,
        history: false,
        snapshot: false,
      });

      await waitForState(aliceActor, "Connected");
      await delay(2000);

      const commands = ["Init", "Abort", "Init"];
      const results: string[] = [];

      for (const command of commands) {
        console.log(`Sending command: ${command}`);
        aliceActor.send({ type: command });
        await delay(1000);

        const snapshot = aliceActor.getSnapshot();
        const state = stateToString(snapshot.value);
        results.push(state);
        console.log(`After ${command}: ${state}`);

        if (snapshot.context.error) {
          console.log(`Error after ${command}:`, snapshot.context.error);
        }
      }

      // Machine should remain functional
      const finalSnapshot = aliceActor.getSnapshot();
      expect(finalSnapshot.context.connection).toBeDefined();
      expect(results.length).toBe(commands.length);
    }, 25000);

    test("should handle network reconnection", async () => {
      // Initial connection
      aliceActor.send({
        type: "Connect",
        baseURL: HYDRA_NODES.alice,
        history: false,
        snapshot: false,
      });

      await waitForState(aliceActor, "Connected");
      await delay(2000);

      const connectedSnapshot = aliceActor.getSnapshot();
      expect(stateToString(connectedSnapshot.value)).toMatch(/Connected/);

      // Disconnect
      aliceActor.send({ type: "Disconnect" });
      await delay(1000);

      const disconnectedSnapshot = aliceActor.getSnapshot();
      expect(stateToString(disconnectedSnapshot.value)).toBe("Disconnected");

      // Reconnect
      aliceActor.send({
        type: "Connect",
        baseURL: HYDRA_NODES.alice,
        history: false,
        snapshot: false,
      });

      await waitForState(aliceActor, "Connected");
      await delay(2000);

      const reconnectedSnapshot = aliceActor.getSnapshot();
      expect(stateToString(reconnectedSnapshot.value)).toMatch(/Connected/);
      expect(reconnectedSnapshot.context.client).toBeDefined();
      expect(reconnectedSnapshot.context.connection).toBeDefined();

      console.log("✅ Network reconnection successful");
    }, 20000);
  });

  describe("Error Handling", () => {
    test("should handle connection to invalid URL", async () => {
      const errorStates: any[] = [];

      const subscription = aliceActor.subscribe((snapshot: any) => {
        if (snapshot.context.error) {
          errorStates.push(snapshot.context.error);
          console.log("Error captured:", snapshot.context.error);
        }
      });

      aliceActor.send({
        type: "Connect",
        baseURL: "http://invalid-hydra-node:9999",
        history: false,
        snapshot: false,
      });

      await delay(5000); // Wait for error

      subscription.unsubscribe();

      const finalSnapshot = aliceActor.getSnapshot();
      const finalState = stateToString(finalSnapshot.value);

      console.log(`Final state after invalid connection: ${finalState}`);

      // Should remain disconnected or have error
      expect(
        finalState === "Disconnected" || finalSnapshot.context.error,
      ).toBeTruthy();
    }, 10000);

    test("should handle context errors properly", async () => {
      // Test that the state machine can handle and store errors
      aliceActor.send({
        type: "Connect",
        baseURL: HYDRA_NODES.alice,
        history: false,
        snapshot: false,
      });

      await waitForState(aliceActor, "Connected");
      await delay(2000);

      // Send an invalid command that should cause an error
      aliceActor.send({ type: "UnknownCommand" as any });
      await delay(1000);

      const snapshot = aliceActor.getSnapshot();
      const state = stateToString(snapshot.value);

      console.log(`State after unknown command: ${state}`);

      // Should remain in a valid state even after invalid command
      expect(state).toMatch(/Connected/);
      expect(snapshot.context.connection).toBeDefined();
    }, 8000);
  });

  describe("Concurrent Operations", () => {
    test("should handle concurrent state machine operations", async () => {
      const actors = [aliceActor, bobActor, carolActor];
      const urls = [HYDRA_NODES.alice, HYDRA_NODES.bob, HYDRA_NODES.carol];
      const names = ["Alice", "Bob", "Carol"];

      // Connect all actors concurrently
      const connectPromises = actors.map((actor, index) => {
        actor.send({
          type: "Connect",
          baseURL: urls[index],
          history: false,
          snapshot: false,
        });
        return waitForState(actor, "Connected");
      });

      await Promise.all(connectPromises);
      await delay(3000);

      // Verify all are connected
      actors.forEach((actor, index) => {
        const snapshot = actor.getSnapshot();
        const state = stateToString(snapshot.value);
        console.log(`${names[index]} final state: ${state}`);

        expect(state).toMatch(/Connected/);
        expect(snapshot.context.client).toBeDefined();
        expect(snapshot.context.connection).toBeDefined();
      });

      // Send commands to all concurrently
      console.log("Sending Init commands to all actors...");
      actors.forEach((actor) => {
        actor.send({ type: "Init" });
      });

      await delay(3000);

      // Check final states
      actors.forEach((actor, index) => {
        const snapshot = actor.getSnapshot();
        const state = stateToString(snapshot.value);
        console.log(`${names[index]} after Init: ${state}`);

        // Should be in some valid state
        expect(snapshot.context.connection).toBeDefined();
      });
    }, 30000);
  });
});

// Prerequisites check
describe("Pure State Machine Prerequisites", () => {
  test("should verify Hydra nodes are accessible", async () => {
    const fetch = (global as any).fetch || require("node-fetch");
    const results = [];

    for (const [nodeName, nodeURL] of Object.entries(HYDRA_NODES)) {
      try {
        const response = await fetch(nodeURL, {
          method: "GET",
          timeout: 5000,
        });
        results.push({
          node: nodeName,
          url: nodeURL,
          status: response.status,
          accessible: true,
        });
      } catch (error) {
        results.push({
          node: nodeName,
          url: nodeURL,
          status: "ERROR",
          accessible: false,
          error: (error as Error).message,
        });
      }
    }

    console.log("Node accessibility results:", results);

    results.forEach((result) => {
      expect(result.accessible).toBe(true);
    });
  }, 15000);
});
