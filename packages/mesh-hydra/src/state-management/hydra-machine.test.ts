import { createActor } from "xstate";
import {
  createHydraMachine,
  HTTPClientFactory,
  WebSocketFactory,
} from "./hydra-machine";
import { HTTPClient } from "../utils";
import { MockHttpClient } from "../mocks/MockHTTPClient";
import { MockWebSocket } from "../mocks/MockWebSocket";

// Create a mock HTTPClientFactory
class MockHTTPClientFactory implements HTTPClientFactory {
  create(baseURL: string): HTTPClient {
    return new MockHttpClient(baseURL) as HTTPClient;
  }
}

// Create a mock WebSocketFactory
class MockWebSocketFactory implements WebSocketFactory {
  create(url: string): WebSocket {
    return new MockWebSocket(url) as unknown as WebSocket;
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function stateToString(value: any): string {
  if (typeof value === "string") return value;
  const obj = value as Record<string, any>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return "";
  const k = keys[0] as keyof typeof obj;
  const v = obj[k];
  return `${k}.${stateToString(v)}`;
}

describe("hydra-machine state transitions", () => {
  let actor: any;
  let ws: MockWebSocket;

  beforeEach(() => {
    MockHttpClient.reset();
    const machine = createHydraMachine({
      httpClientFactory: new MockHTTPClientFactory(),
      webSocketFactory: new MockWebSocketFactory(),
    });
    actor = createActor(machine);
    actor.start();
  });

  afterEach(() => {
    actor.stop();
  });

  describe("Connection flow", () => {
    test("Disconnected -> Connected.Handshake -> NoHead", async () => {
      expect(stateToString(actor.getSnapshot().value)).toBe("Disconnected");

      // Connect triggers server invoke; TestWebSocket opens and emits Ready
      actor.send({
        type: "Connect",
        baseURL: "http://localhost:4001",
        history: true,
        snapshot: false,
      });
      await flush();

      // Should be in Handshake waiting for Greetings
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Handshake",
      );

      // Get WebSocket instance
      ws = actor.getSnapshot().context.connection as unknown as MockWebSocket;

      // Send Greetings with Idle status
      ws.mockReceive({ tag: "Greetings", headStatus: "Idle" });

      expect(stateToString(actor.getSnapshot().value)).toBe("Connected.NoHead");
      expect(actor.getSnapshot().context.client).toBeDefined();
    });

    test("Handshake transitions to correct state based on Greetings", async () => {
      const testCases = [
        { headStatus: "Idle", expectedState: "Connected.NoHead" },
        {
          headStatus: "Initializing",
          expectedState: "Connected.Initializing.Waiting",
        },
        { headStatus: "Open", expectedState: "Connected.Open.Active" },
        { headStatus: "Closed", expectedState: "Connected.Closed" },
        {
          headStatus: "FanoutPossible",
          expectedState: "Connected.FanoutPossible",
        },
        { headStatus: "Final", expectedState: "Connected.Final" },
      ];

      for (const { headStatus, expectedState } of testCases) {
        const machine = createHydraMachine({
          httpClientFactory: new MockHTTPClientFactory(),
          webSocketFactory: new MockWebSocketFactory(),
        });
        const testActor = createActor(machine);
        testActor.start();

        testActor.send({ type: "Connect", baseURL: "http://localhost:4001" });
        await flush();

        const testWs = testActor.getSnapshot().context
          .connection as unknown as MockWebSocket;
        testWs.mockReceive({ tag: "Greetings", headStatus });

        expect(stateToString(testActor.getSnapshot().value)).toBe(
          expectedState,
        );
        testActor.stop();
      }
    });
  });

  describe("Initializing state", () => {
    beforeEach(async () => {
      actor.send({ type: "Connect", baseURL: "http://localhost:4001" });
      await flush();
      ws = actor.getSnapshot().context.connection as unknown as MockWebSocket;
      ws.mockReceive({ tag: "Greetings", headStatus: "Idle" });
    });

    test("Init -> Initializing -> Commit flow -> Open", async () => {
      // Start head initialization
      actor.send({ type: "Init" });

      // Server indicates head is initializing
      ws.mockReceive({ tag: "HeadIsInitializing" });
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Waiting",
      );

      // Start commit process
      const request = { utxos: ["utxo1", "utxo2"] };
      actor.send({ type: "Commit", data: request });

      // Should be in RequestDraft state
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Depositing.RequestDraft",
      );

      // Wait for HTTP call to complete
      await flush();

      // HTTP was called
      expect(MockHttpClient.postCalls[0]).toEqual({
        endpoint: "/commit",
        payload: request,
      });

      // Should move to AwaitSignature with draft tx
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Depositing.AwaitSignature",
      );
      expect(actor.getSnapshot().context.draftTx).toBeDefined();

      // Submit signed deposit
      const signedTx = {
        type: "TxBabbage",
        description: "Signed tx",
        cborHex: "signed...",
      };
      actor.send({ type: "SubmitSignedDeposit", tx: signedTx });

      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Depositing.SubmittingDeposit",
      );

      // Wait for submission
      await flush();

      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Depositing.AwaitingCommitConfirmation",
      );

      // Server confirms commit (legacy flow for initial commits)
      ws.mockReceive({ tag: "Committed" });

      // Should complete depositing and return to waiting
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Waiting",
      );

      // Head opens
      ws.mockReceive({ tag: "HeadIsOpen" });
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Open.Active",
      );
    });

    test("Abort during Initializing", async () => {
      ws.mockReceive({ tag: "HeadIsInitializing" });
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Waiting",
      );

      actor.send({ type: "Abort" });
      ws.mockReceive({ tag: "HeadIsAborted" });

      expect(stateToString(actor.getSnapshot().value)).toBe("Connected.Final");
    });

    test("Commit error handling and retry", async () => {
      ws.mockReceive({ tag: "HeadIsInitializing" });

      // First commit attempt will fail - set up error before sending
      MockHttpClient.nextPostErrors.push(new Error("Network error"));
      actor.send({ type: "Commit", data: { attempt: 1 } });

      // Should be in RequestDraft state briefly
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Depositing.RequestDraft",
      );

      // Wait for error to process
      await flush();

      // Should return to ReadyToCommit within Depositing
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Depositing.ReadyToCommit",
      );
      expect(actor.getSnapshot().context.error).toBeDefined();

      // Retry successfully
      actor.send({ type: "Commit", data: { attempt: 2 } });

      // Should be in RequestDraft again
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Depositing.RequestDraft",
      );

      await flush();

      // Should move to AwaitSignature after successful draft
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Initializing.Depositing.AwaitSignature",
      );
    });
  });

  describe("Open state", () => {
    beforeEach(async () => {
      actor.send({ type: "Connect", baseURL: "http://localhost:4001" });
      await flush();
      ws = actor.getSnapshot().context.connection as unknown as MockWebSocket;
      ws.mockReceive({ tag: "Greetings", headStatus: "Open" });
    });

    test("NewTx command", async () => {
      const tx = "84a4...";
      actor.send({ type: "NewTx", tx });

      const sentMessages = ws.sentMessages;
      const lastMessage = JSON.parse(
        sentMessages[sentMessages.length - 1] as string,
      );
      expect(lastMessage).toEqual({ tag: "NewTx", transaction: tx });
    });

    test("Incremental commit flow", async () => {
      const request = { newUtxo: "utxo3" };
      actor.send({ type: "Commit", data: request });

      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Open.Depositing.RequestDraft",
      );

      await flush();

      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Open.Depositing.AwaitSignature",
      );

      // External submission
      actor.send({ type: "DepositSubmittedExternally" });
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Open.Depositing.AwaitingCommitConfirmation",
      );

      // Server confirms incremental commit
      ws.mockReceive({ tag: "CommitFinalized" });

      // Should return to Active
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Open.Active",
      );
    });

    test("Close -> Closed -> Contest flow", async () => {
      actor.send({ type: "Close" });
      ws.mockReceive({ tag: "HeadIsClosed" });

      expect(stateToString(actor.getSnapshot().value)).toBe("Connected.Closed");

      // Contest the closure
      actor.send({ type: "Contest" });

      // Contest updates the closed state, doesn't transition
      ws.mockReceive({ tag: "HeadIsContested" });
      expect(stateToString(actor.getSnapshot().value)).toBe("Connected.Closed");

      // Ready to fanout
      ws.mockReceive({ tag: "ReadyToFanout" });
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.FanoutPossible",
      );

      // Fanout
      actor.send({ type: "Fanout" });
      ws.mockReceive({ tag: "HeadIsFinalized" });

      expect(stateToString(actor.getSnapshot().value)).toBe("Connected.Final");
    });

    test("Decommit and Recover commands", async () => {
      const decommitTx = "decommit_tx";
      actor.send({ type: "Decommit", tx: decommitTx });

      let lastMessage = JSON.parse(
        ws.sentMessages[ws.sentMessages.length - 1] as string,
      );
      expect(lastMessage).toEqual({ tag: "Decommit", decommitTx });

      const txHash = "abc123";
      actor.send({ type: "Recover", txHash });

      lastMessage = JSON.parse(
        ws.sentMessages[ws.sentMessages.length - 1] as string,
      );
      expect(lastMessage).toEqual({ tag: "Recover", recoverTxId: txHash });
    });
  });

  describe("Error handling", () => {
    beforeEach(async () => {
      actor.send({ type: "Connect", baseURL: "http://localhost:4001" });
      await flush();
      ws = actor.getSnapshot().context.connection as unknown as MockWebSocket;
      ws.mockReceive({ tag: "Greetings", headStatus: "Open" });
    });

    test("InvalidInput error", () => {
      ws.mockReceive({
        tag: "InvalidInput",
        reason: "Invalid transaction format",
        input: "bad_tx",
      });

      const error = actor.getSnapshot().context.error;
      expect(error).toBeDefined();
      expect(error.kind).toBe("InvalidInput");
    });

    test("CommandFailed error", () => {
      ws.mockReceive({
        tag: "CommandFailed",
        clientInput: { tag: "Close" },
      });

      const error = actor.getSnapshot().context.error;
      expect(error).toBeDefined();
      expect(error.kind).toBe("CommandFailed");
    });

    test("Network events don't change state", () => {
      const initialState = stateToString(actor.getSnapshot().value);

      ws.mockReceive({ tag: "NetworkConnected" });
      ws.mockReceive({ tag: "NetworkDisconnected" });
      ws.mockReceive({ tag: "PeerConnected", peer: "peer1" });
      ws.mockReceive({ tag: "PeerDisconnected", peer: "peer1" });

      expect(stateToString(actor.getSnapshot().value)).toBe(initialState);
    });
  });

  describe("Complete lifecycle", () => {
    test("Full head lifecycle: Init -> Open -> Close -> Fanout", async () => {
      // Connect
      actor.send({ type: "Connect", baseURL: "http://localhost:4001" });
      await flush();
      ws = actor.getSnapshot().context.connection as unknown as MockWebSocket;

      // Start from idle
      ws.mockReceive({ tag: "Greetings", headStatus: "Idle" });
      expect(stateToString(actor.getSnapshot().value)).toBe("Connected.NoHead");

      // Initialize
      actor.send({ type: "Init" });
      ws.mockReceive({ tag: "HeadIsInitializing" });

      // Wait for others to commit
      ws.mockReceive({ tag: "Committed", party: "alice" });
      ws.mockReceive({ tag: "Committed", party: "bob" });

      // Head opens
      ws.mockReceive({ tag: "HeadIsOpen" });
      expect(stateToString(actor.getSnapshot().value)).toBe(
        "Connected.Open.Active",
      );

      // Submit transactions
      actor.send({ type: "NewTx", tx: "tx1" });
      ws.mockReceive({ tag: "TxValid", transaction: "tx1" });
      ws.mockReceive({ tag: "SnapshotConfirmed", snapshot: { number: 1 } });

      // Close head
      actor.send({ type: "Close" });
      ws.mockReceive({ tag: "HeadIsClosed" });
      expect(stateToString(actor.getSnapshot().value)).toBe("Connected.Closed");

      // Fanout
      ws.mockReceive({ tag: "ReadyToFanout" });
      actor.send({ type: "Fanout" });
      ws.mockReceive({ tag: "HeadIsFinalized" });

      expect(stateToString(actor.getSnapshot().value)).toBe("Connected.Final");

      // Can start new head from Final state
      actor.send({ type: "Init" });
      expect(ws.sentMessages.some((m) => JSON.parse(m).tag === "Init")).toBe(
        true,
      );
    });
  });
});
