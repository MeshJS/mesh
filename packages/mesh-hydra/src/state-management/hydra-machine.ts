import {
  AnyEventObject,
  assertEvent,
  assign,
  fromCallback,
  fromPromise,
  sendTo,
  setup,
} from "xstate";
import { HTTPClient } from "../utils";

/** ===== Strict types for Cardano transactions accepted by hydra-node ===== */

/** Hex-encoded CBOR string (hydra-node accepts this form). */
export type CborHex = string;

/** TextEnvelope wrapper ({"type", "description", "cborHex"}) */
export type TxTextEnvelope = {
  type: string;
  description: string;
  cborHex: CborHex;
};

/** JSON format of Cardano transaction */
export type TxJSON = Record<string, unknown>;

/** Transaction payload accepted by hydra-node via WS/HTTP. */
export type Transaction = TxTextEnvelope | CborHex | TxJSON;

/** ===== Minimal shapes for server outputs we care about (tags per AsyncAPI) ===== */

type TimedMeta = {
  seq?: number;
  timestamp?: string;
};

type HeadStatus =
  | "Idle"
  | "Initializing"
  | "Open"
  | "Closed"
  | "FanoutPossible"
  | "Final";

type MsgGreetings = {
  tag: "Greetings";
  headStatus: HeadStatus;
};

type MsgHeadState =
  | { tag: "HeadIsInitializing" }
  | { tag: "HeadIsOpen" }
  | { tag: "HeadIsClosed" }
  | { tag: "HeadIsContested" }
  | { tag: "ReadyToFanout" }
  | { tag: "HeadIsAborted" }
  | { tag: "HeadIsFinalized" };

type MsgCommitted = { tag: "Committed" };

type MsgCommitRecorded = { tag: "CommitRecorded" };
type MsgCommitApproved = { tag: "CommitApproved" };
type MsgCommitFinalized = { tag: "CommitFinalized" };
type MsgCommitRecovered = { tag: "CommitRecovered" };

// Network events
type MsgNetworkConnected = { tag: "NetworkConnected" };
type MsgNetworkDisconnected = { tag: "NetworkDisconnected" };
type MsgPeerConnected = { tag: "PeerConnected"; peer: string };
type MsgPeerDisconnected = { tag: "PeerDisconnected"; peer: string };
type MsgNetworkVersionMismatch = { tag: "NetworkVersionMismatch" };
type MsgNetworkClusterIDMismatch = { tag: "NetworkClusterIDMismatch" };

// Transaction events
type MsgTxValid = { tag: "TxValid"; transaction: Transaction };
type MsgSnapshotConfirmed = { tag: "SnapshotConfirmed" };

// Decommit events
type MsgDecommitInvalid = { tag: "DecommitInvalid" };
type MsgDecommitRequested = { tag: "DecommitRequested" };
type MsgDecommitApproved = { tag: "DecommitApproved" };
type MsgDecommitFinalized = { tag: "DecommitFinalized" };

// Deposit events
type MsgDepositRecorded = {
  tag: "DepositRecorded";
  depositTxId: string;
  deposited: unknown; // UTxO
  deadline: string;
};
type MsgDepositActivated = {
  tag: "DepositActivated";
  depositTxId: string;
  deadline: string;
};
type MsgDepositExpired = {
  tag: "DepositExpired";
  depositTxId: string;
  deadline: string;
};

// Other events
type MsgIgnoredHeadInitializing = { tag: "IgnoredHeadInitializing" };
type MsgSnapshotSideLoaded = { tag: "SnapshotSideLoaded" };
type MsgEventLogRotated = { tag: "EventLogRotated" };

type MsgInvalidInput = { tag: "InvalidInput"; reason: string; input: string };
type MsgCommandFailed = { tag: "CommandFailed"; clientInput: unknown };
type MsgTxInvalid = {
  tag: "TxInvalid";
  validationError?: { reason?: string } | string;
};
type MsgPostTxOnChainFailed = {
  tag: "PostTxOnChainFailed";
  postTxError: unknown;
};

type HydraServerOutput = TimedMeta &
  (
    | MsgGreetings
    | MsgHeadState
    | MsgCommitted
    | MsgCommitRecorded
    | MsgCommitApproved
    | MsgCommitFinalized
    | MsgCommitRecovered
    | MsgNetworkConnected
    | MsgNetworkDisconnected
    | MsgPeerConnected
    | MsgPeerDisconnected
    | MsgNetworkVersionMismatch
    | MsgNetworkClusterIDMismatch
    | MsgTxValid
    | MsgTxInvalid
    | MsgSnapshotConfirmed
    | MsgDecommitInvalid
    | MsgDecommitRequested
    | MsgDecommitApproved
    | MsgDecommitFinalized
    | MsgDepositRecorded
    | MsgDepositActivated
    | MsgDepositExpired
    | MsgIgnoredHeadInitializing
    | MsgSnapshotSideLoaded
    | MsgEventLogRotated
    | MsgInvalidInput
    | MsgCommandFailed
    | MsgPostTxOnChainFailed
    | { tag: string; [k: string]: unknown }
  );

type PostTxErrorDetail =
  | { tag: "ScriptFailedInWallet"; redeemerPtr: string; failureReason: string }
  | { tag: "InternalWalletError"; reason: string }
  | { tag: "NotEnoughFuel" }
  | { tag: "NoFuelUTXOFound" }
  | { tag: "CannotFindOwnInitial" }
  | { tag: "UnsupportedLegacyOutput" }
  | { tag: "NoSeedInput" }
  | { tag: "InvalidStateToPost"; reason: string }
  | { tag: "FailedToPostTx"; reason: string }
  | { tag: "CommittedTooMuchADAForMainnet"; committed: number; maximum: number }
  | { tag: "FailedToDraftTxNotInitializing" }
  | { tag: "InvalidSeed" }
  | { tag: "InvalidHeadId" }
  | { tag: "FailedToConstructAbortTx" }
  | { tag: "FailedToConstructCloseTx" }
  | { tag: "FailedToConstructContestTx" }
  | { tag: "FailedToConstructCollectTx" }
  | { tag: "FailedToConstructDepositTx" }
  | { tag: "FailedToConstructRecoverTx" }
  | { tag: "FailedToConstructIncrementTx" }
  | { tag: "FailedToConstructDecrementTx" }
  | { tag: "FailedToConstructFanoutTx" }
  | { tag: "DepositTooLow"; deposit: number; minDeposit: number }
  | { tag: "AmountTooLow"; lovelace: number };

type DecommitInvalidReason =
  | { tag: "DecommitTxInvalid"; validationError: { reason?: string } }
  | { tag: "DecommitAlreadyInFlight" };

type HydraError =
  | { kind: "InvalidInput"; message: string; source: MsgInvalidInput }
  | { kind: "CommandFailed"; message: string; source: MsgCommandFailed }
  | { kind: "TxInvalid"; message?: string; source: MsgTxInvalid }
  | {
      kind: "PostTxOnChainFailed";
      message?: string;
      source: MsgPostTxOnChainFailed;
      detail?: PostTxErrorDetail;
    }
  | {
      kind: "DecommitInvalid";
      message?: string;
      reason?: DecommitInvalidReason;
    };

// Define interfaces for dependencies to enable dependency injection
export interface WebSocketFactory {
  create(url: string): WebSocket;
}

export interface HTTPClientFactory {
  create(baseURL: string): HTTPClient;
}

// Default implementations
export class DefaultWebSocketFactory implements WebSocketFactory {
  create(url: string): WebSocket {
    return new WebSocket(url);
  }
}

export class DefaultHTTPClientFactory implements HTTPClientFactory {
  create(baseURL: string): HTTPClient {
    return new HTTPClient(baseURL);
  }
}

// Configuration interface for the machine
export interface HydraMachineConfig {
  webSocketFactory?: WebSocketFactory;
  httpClientFactory?: HTTPClientFactory;
}

export function createHydraMachine(config: HydraMachineConfig = {}) {
  const {
    webSocketFactory = new DefaultWebSocketFactory(),
    httpClientFactory = new DefaultHTTPClientFactory(),
  } = config;

  return setup({
    actions: {
      /** === WebSocket commands === */
      newTx: sendTo("server", ({ event }) => {
        assertEvent(event, "NewTx");
        return { type: "Send", data: { tag: "NewTx", transaction: event.tx } };
      }),
      recoverUTxO: sendTo("server", ({ event }) => {
        assertEvent(event, "Recover");
        return {
          type: "Send",
          data: { tag: "Recover", recoverTxId: event.txHash },
        };
      }),
      decommitUTxO: sendTo("server", ({ event }) => {
        assertEvent(event, "Decommit");
        return {
          type: "Send",
          data: { tag: "Decommit", decommitTx: event.tx },
        };
      }),
      initHead: sendTo("server", { type: "Send", data: { tag: "Init" } }),
      abortHead: sendTo("server", { type: "Send", data: { tag: "Abort" } }),
      closeHead: sendTo("server", { type: "Send", data: { tag: "Close" } }),
      contestHead: sendTo("server", {
        type: "Send",
        data: { tag: "Contest" },
      }),
      fanoutHead: sendTo("server", { type: "Send", data: { tag: "Fanout" } }),
      sideLoadSnapshot: sendTo("server", ({ event }) => {
        assertEvent(event, "SideLoadSnapshot");
        return {
          type: "Send",
          data: { tag: "SideLoadSnapshot", snapshot: event.snapshot },
        };
      }),

      /** === Connection / context === */
      closeConnection: assign(({ context }) => {
        if (context.connection?.readyState === WebSocket.OPEN) {
          context.connection.close(1000, "Client disconnected");
        }
        return {
          baseURL: "",
          headURL: "",
          connection: undefined,
          client: undefined,
          error: undefined,
          request: undefined,
          draftTx: undefined,
          signedDepositTx: undefined,
        };
      }),
      setURL: assign(({ event }) => {
        assertEvent(event, "Connect");
        const url = event.baseURL.replace(/^http/, "ws"); // http->ws, https->wss
        const history = `history=${event.history ? "yes" : "no"}`;
        const snapshot = `snapshot-utxo=${event.snapshot ? "yes" : "no"}`;
        const address = event.address
          ? `&address=${encodeURIComponent(event.address)}`
          : "";
        return {
          baseURL: event.baseURL,
          headURL: `${url}/?${history}&${snapshot}${address}`,
        };
      }),
      setConnection: assign(({ event }) => {
        assertEvent(event, "Ready");
        return { connection: event.connection };
      }),
      createClient: assign(({ context }) => ({
        client: httpClientFactory.create(context.baseURL),
      })),
      setError: assign(({ event }) => {
        const anyEvent = event as any;
        const data = "data" in anyEvent ? anyEvent.data : anyEvent.error;
        return { error: data ?? anyEvent };
      }),
      clearError: assign(() => ({ error: undefined })),
      setRequest: assign(({ event }) => {
        assertEvent(event, "Commit");
        return { request: event.data };
      }),
      clearRequest: assign(() => ({ request: undefined })),
      clearDraftTx: assign(() => ({
        draftTx: undefined,
        signedDepositTx: undefined,
      })),

      /** === Error capture from server messages === */
      captureServerError: assign(({ event }) => {
        assertEvent(event, "Message");
        const msg = event.data as HydraServerOutput;
        if (msg.tag === "InvalidInput") {
          const typedMsg = msg as MsgInvalidInput;
          const err: HydraError = {
            kind: "InvalidInput",
            message: typedMsg.reason,
            source: typedMsg,
          };
          return { error: err };
        }
        if (msg.tag === "CommandFailed") {
          const typedMsg = msg as MsgCommandFailed;
          const err: HydraError = {
            kind: "CommandFailed",
            message: "Command failed",
            source: typedMsg,
          };
          return { error: err };
        }
        if (msg.tag === "TxInvalid") {
          const typedMsg = msg as MsgTxInvalid;
          const reason =
            typeof typedMsg.validationError === "string"
              ? typedMsg.validationError
              : typedMsg.validationError?.reason;
          const err: HydraError = {
            kind: "TxInvalid",
            message: reason,
            source: typedMsg,
          };
          return { error: err };
        }
        if (msg.tag === "PostTxOnChainFailed") {
          const typedMsg = msg as MsgPostTxOnChainFailed;
          const err: HydraError = {
            kind: "PostTxOnChainFailed",
            message: "PostTx failed",
            source: typedMsg,
            detail: typedMsg.postTxError as PostTxErrorDetail,
          };
          return { error: err };
        }
        if (msg.tag === "DecommitInvalid") {
          const typedMsg = msg as MsgDecommitInvalid;
          const err: HydraError = {
            kind: "DecommitInvalid",
            message: "Decommit invalid",
            reason: (typedMsg as any)
              .decommitInvalidReason as DecommitInvalidReason,
          };
          return { error: err };
        }
        return {};
      }),
    },

    guards: {
      /** Head status guards */
      isGreetings: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "Greetings";
      },
      isIdle: ({ event }) => {
        assertEvent(event, "Message");
        const d = event.data as HydraServerOutput;
        return (
          d.tag === "Greetings" && (d as MsgGreetings).headStatus === "Idle"
        );
      },
      isInitializing: ({ event }) => {
        assertEvent(event, "Message");
        const d = event.data as HydraServerOutput;
        return (
          (d.tag === "Greetings" &&
            (d as MsgGreetings).headStatus === "Initializing") ||
          d.tag === "HeadIsInitializing"
        );
      },
      isAborted: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "HeadIsAborted";
      },
      isCommitted: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "Committed";
      },
      isCommitRecorded: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "CommitRecorded";
      },
      isCommitFinalized: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "CommitFinalized";
      },
      isCommitRecovered: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "CommitRecovered";
      },
      isCommitApproved: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "CommitApproved";
      },
      isOpen: ({ event }) => {
        assertEvent(event, "Message");
        const d = event.data as HydraServerOutput;
        return (
          (d.tag === "Greetings" &&
            (d as MsgGreetings).headStatus === "Open") ||
          d.tag === "HeadIsOpen"
        );
      },
      isClosed: ({ event }) => {
        assertEvent(event, "Message");
        const d = event.data as HydraServerOutput;
        return (
          (d.tag === "Greetings" &&
            (d as MsgGreetings).headStatus === "Closed") ||
          d.tag === "HeadIsClosed"
        );
      },
      isContested: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "HeadIsContested";
      },
      isReadyToFanout: ({ event }) => {
        assertEvent(event, "Message");
        const d = event.data as HydraServerOutput;
        return (
          (d.tag === "Greetings" &&
            (d as MsgGreetings).headStatus === "FanoutPossible") ||
          d.tag === "ReadyToFanout"
        );
      },
      isFinalized: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "HeadIsFinalized";
      },
      isFinalStatus: ({ event }) => {
        assertEvent(event, "Message");
        const d = event.data as HydraServerOutput;
        return (
          d.tag === "Greetings" && (d as MsgGreetings).headStatus === "Final"
        );
      },

      /** Error guards */
      isInvalidInput: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "InvalidInput";
      },
      isCommandFailed: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "CommandFailed";
      },
      isTxInvalid: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "TxInvalid";
      },
      isPostTxFailed: ({ event }) => {
        assertEvent(event, "Message");
        return (
          (event.data as HydraServerOutput).tag === "PostTxOnChainFailed"
        );
      },
      isDecommitInvalid: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "DecommitInvalid";
      },

      /** Commit confirmation guards */
      isLegacyCommitEvent: ({ event }) => {
        assertEvent(event, "Message");
        const t = (event.data as HydraServerOutput).tag;
        return t === "Committed";
      },
      isIncrementalCommitEvent: ({ event }) => {
        assertEvent(event, "Message");
        const t = (event.data as HydraServerOutput).tag;
        return (
          t === "CommitRecorded" ||
          t === "CommitApproved" ||
          t === "CommitFinalized" ||
          t === "CommitRecovered"
        );
      },

      /** Deposit guards */
      isDepositRecorded: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "DepositRecorded";
      },
      isDepositActivated: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "DepositActivated";
      },
      isDepositExpired: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "DepositExpired";
      },

      /** Decommit guards */
      isDecommitRequested: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "DecommitRequested";
      },
      isDecommitApproved: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "DecommitApproved";
      },
      isDecommitFinalized: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "DecommitFinalized";
      },

      /** Transaction guards */
      isTxValid: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "TxValid";
      },
      isSnapshotConfirmed: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "SnapshotConfirmed";
      },

      /** Network guards */
      isNetworkConnected: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "NetworkConnected";
      },
      isNetworkDisconnected: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "NetworkDisconnected";
      },
      isPeerConnected: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "PeerConnected";
      },
      isPeerDisconnected: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "PeerDisconnected";
      },

      /** Other guards */
      isIgnoredHeadInitializing: ({ event }) => {
        assertEvent(event, "Message");
        return (
          (event.data as HydraServerOutput).tag === "IgnoredHeadInitializing"
        );
      },
      isSnapshotSideLoaded: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "SnapshotSideLoaded";
      },
      isEventLogRotated: ({ event }) => {
        assertEvent(event, "Message");
        return (event.data as HydraServerOutput).tag === "EventLogRotated";
      },
    },

    actors: {
      /** Long-lived WS actor */
      server: fromCallback<AnyEventObject, { url: string }>(
        ({ sendBack, receive, input }) => {
          const ws = webSocketFactory.create(input.url);

          ws.onopen = () => sendBack({ type: "Ready", connection: ws });
          ws.onerror = (error) => sendBack({ type: "Error", data: error });
          ws.onmessage = (event) => {
            try {
              sendBack({ type: "Message", data: JSON.parse(event.data) });
            } catch (e) {
              sendBack({ type: "Error", data: e });
            }
          };
          ws.onclose = (event) =>
            sendBack({ type: "Disconnect", code: event.code });

          receive((event) => {
            assertEvent(event, "Send");
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify(event.data));
            else
              sendBack({
                type: "Error",
                data: new Error("Connection is not open"),
              });
          });

          return () => {
            try {
              ws.close();
            } catch {
              /* noop */
            }
          };
        },
      ),

      requestDepositDraft: fromPromise<
        Transaction,
        { client?: HTTPClient; request: unknown }
      >(async ({ input, signal }) => {
        if (!input.client) throw new Error("Client is not initialized");
        if (!input.request) throw new Error("Request is not provided");
        const { client, request } = input;
        const draft = (await client.post(
          "/commit",
          request,
          undefined,
          signal,
        )) as Transaction;
        return draft;
      }),

      submitCardanoTx: fromPromise<
        unknown,
        { client?: HTTPClient; tx: Transaction; path?: string }
      >(async ({ input, signal }) => {
        if (!input.client) throw new Error("Client is not initialized");
        if (!input.tx) throw new Error("Signed transaction is not provided");
        const { client, tx, path } = input;
        return await client.post(
          path ?? "/cardano-transaction",
          tx,
          undefined,
          signal,
        );
      }),
    },

    types: {
      context: {} as {
        baseURL: string;
        client?: HTTPClient;
        connection?: WebSocket;
        error?: HydraError | unknown;
        headURL: string;
        request?: unknown;
        draftTx?: Transaction;
        signedDepositTx?: Transaction;
        submitPath?: string;
      },
      events: {} as
        | {
            type: "Connect";
            baseURL: string;
            address?: string;
            snapshot?: boolean;
            history?: boolean;
          }
        | { type: "Ready"; connection: WebSocket }
        | { type: "Send"; data: unknown }
        | { type: "Message"; data: HydraServerOutput }
        | { type: "Error"; data: unknown }
        | { type: "Disconnect"; code: number }
        | { type: "Init" }
        | { type: "Commit"; data: unknown }
        | { type: "NewTx"; tx: Transaction }
        | { type: "Recover"; txHash: string }
        | { type: "Decommit"; tx: Transaction }
        | { type: "Abort" }
        | { type: "Contest" }
        | { type: "Fanout" }
        | { type: "Close" }
        | { type: "SubmitSignedDeposit"; tx: Transaction }
        | { type: "DepositSubmittedExternally" }
        | { type: "SideLoadSnapshot"; snapshot: unknown },
    },
  }).createMachine({
    id: "HYDRA",
    initial: "Disconnected",
    context: {
      baseURL: "",
      headURL: "",
      submitPath: "/cardano-transaction",
    },

    states: {
      Disconnected: {
        on: {
          Connect: { target: "Connected", actions: "setURL" },
        },
      },

      Connected: {
        invoke: {
          id: "server",
          src: "server",
          input: ({ context }) => ({ url: context.headURL }),
        },

        on: {
          Message: [
            // Error handling
            { guard: "isInvalidInput", actions: "captureServerError" },
            { guard: "isCommandFailed", actions: "captureServerError" },
            { guard: "isTxInvalid", actions: "captureServerError" },
            { guard: "isPostTxFailed", actions: "captureServerError" },
            { guard: "isDecommitInvalid", actions: "captureServerError" },

            // Network events (can happen in any state)
            { guard: "isNetworkConnected", actions: [] },
            { guard: "isNetworkDisconnected", actions: [] },
            { guard: "isPeerConnected", actions: [] },
            { guard: "isPeerDisconnected", actions: [] },

            // Other events that can happen anytime
            { guard: "isIgnoredHeadInitializing", actions: [] },
            { guard: "isEventLogRotated", actions: [] },

            // Head state transitions
            { guard: "isIdle", target: ".NoHead" },
            { guard: "isInitializing", target: ".Initializing" },
            { guard: "isOpen", target: ".Open" },
            { guard: "isClosed", target: ".Closed" },
            { guard: "isReadyToFanout", target: ".FanoutPossible" },
            // Contest updates the Closed state, doesn't create new state
            { guard: "isAborted", target: ".Final" },
            { guard: "isFinalized", target: ".Final" },
            { guard: "isFinalStatus", target: ".Final" },
          ],
          Disconnect: { target: "Disconnected", actions: "closeConnection" },
          Error: { actions: "setError" },
        },

        initial: "Handshake",
        states: {
          Handshake: {
            on: {
              Ready: {
                // Stay in handshake, just save connection
                actions: ["setConnection", "createClient"],
              },
              Message: [
                // Wait for Greetings to determine initial state
                { guard: "isIdle", target: "NoHead" },
                { guard: "isInitializing", target: "Initializing" },
                { guard: "isOpen", target: "Open" },
                { guard: "isClosed", target: "Closed" },
                { guard: "isReadyToFanout", target: "FanoutPossible" },
                { guard: "isFinalStatus", target: "Final" },
              ],
            },
          },

          NoHead: {
            on: {
              Init: { actions: ["clearError", "initHead"] },
            },
          },

          Initializing: {
            on: {
              Abort: { actions: ["clearError", "abortHead"] },
              // Recover and Decommit are only available in Open state
              Message: [
                // Handle when other parties commit
                { guard: "isCommitted", actions: [] },
              ],
            },
            initial: "Waiting",
            states: {
              Waiting: {
                // Waiting for user to commit or for head to open
                on: {
                  Commit: {
                    target:
                      "#HYDRA.Connected.Initializing.Depositing.RequestDraft",
                    actions: ["clearError", "setRequest"],
                  },
                },
              },
              Depositing: {
                initial: "ReadyToCommit" as const,
                on: {
                  SubmitSignedDeposit: { target: ".SubmittingDeposit" },
                  DepositSubmittedExternally: {
                    target: ".AwaitingCommitConfirmation",
                  },
                },
                states: {
                  ReadyToCommit: {
                    on: {
                      Commit: {
                        target: "RequestDraft",
                        actions: ["clearError", "setRequest"],
                      },
                    },
                  },

                  RequestDraft: {
                    invoke: {
                      src: "requestDepositDraft",
                      input: ({ context }: any) => ({
                        client: context.client,
                        request: context.request,
                      }),
                      onDone: {
                        target: "AwaitSignature",
                        actions: assign(({ event }: any) => ({
                          draftTx: event.output as Transaction,
                        })),
                      },
                      onError: {
                        target: "ReadyToCommit",
                        actions: "setError",
                      },
                    },
                  },

                  AwaitSignature: {
                    on: {
                      SubmitSignedDeposit: {
                        target: "SubmittingDeposit",
                        actions: assign(({ event }: any) => {
                          assertEvent(event, "SubmitSignedDeposit");
                          return { signedDepositTx: event.tx as Transaction };
                        }),
                      },
                      DepositSubmittedExternally: {
                        target: "AwaitingCommitConfirmation",
                      },
                    },
                  },

                  SubmittingDeposit: {
                    invoke: {
                      src: "submitCardanoTx",
                      input: ({ context }: any) => ({
                        client: context.client,
                        tx: context.signedDepositTx as Transaction,
                        path: context.submitPath,
                      }),
                      onDone: { target: "AwaitingCommitConfirmation" },
                      onError: {
                        target: "AwaitSignature",
                        actions: "setError",
                      },
                    },
                  },

                  AwaitingCommitConfirmation: {
                    on: {
                      Message: {
                        guard: "isLegacyCommitEvent",
                        target: "Done",
                        actions: ["clearRequest", "clearDraftTx"],
                      },
                    },
                  },

                  Done: { type: "final" as const },
                },
                onDone: {
                  // Return to Waiting after successful commit
                  target: "Waiting",
                },
              },
            },
          },

          Open: {
            on: {
              Close: { actions: ["clearError", "closeHead"] },
              NewTx: { actions: ["clearError", "newTx"] },
              Decommit: { actions: ["clearError", "decommitUTxO"] },
              Recover: { actions: ["clearError", "recoverUTxO"] },
              SideLoadSnapshot: {
                actions: ["clearError", "sideLoadSnapshot"],
              },
              Message: [
                // Handle deposit/commit events
                { guard: "isCommitRecorded", actions: [] }, // Track pending deposits if needed for UI
                { guard: "isCommitApproved", actions: [] }, // Server approved the commit
                { guard: "isCommitFinalized", actions: [] }, // Deposit confirmed and UTxO updated
                { guard: "isCommitRecovered", actions: [] }, // Deposit was recovered
                { guard: "isDepositActivated", actions: [] },
                { guard: "isDepositExpired", actions: [] },
                // Handle decommit events
                { guard: "isDecommitRequested", actions: [] },
                { guard: "isDecommitApproved", actions: [] },
                { guard: "isDecommitFinalized", actions: [] },
                // Handle transaction events
                { guard: "isTxValid", actions: [] },
                { guard: "isSnapshotConfirmed", actions: [] },
                // Handle snapshot side-loading
                { guard: "isSnapshotSideLoaded", actions: [] },
              ],
            },
            initial: "Active",
            states: {
              Active: {
                on: {
                  Commit: {
                    target: "#HYDRA.Connected.Open.Depositing.RequestDraft",
                    actions: ["clearError", "setRequest"],
                  },
                },
              },
              Depositing: {
                initial: "ReadyToCommit" as const,
                on: {
                  SubmitSignedDeposit: { target: ".SubmittingDeposit" },
                  DepositSubmittedExternally: {
                    target: ".AwaitingCommitConfirmation",
                  },
                },
                states: {
                  ReadyToCommit: {
                    on: {
                      Commit: {
                        target: "RequestDraft",
                        actions: ["clearError", "setRequest"],
                      },
                    },
                  },

                  RequestDraft: {
                    invoke: {
                      src: "requestDepositDraft",
                      input: ({ context }: any) => ({
                        client: context.client,
                        request: context.request,
                      }),
                      onDone: {
                        target: "AwaitSignature",
                        actions: assign(({ event }: any) => ({
                          draftTx: event.output as Transaction,
                        })),
                      },
                      onError: {
                        target: "ReadyToCommit",
                        actions: "setError",
                      },
                    },
                  },

                  AwaitSignature: {
                    on: {
                      SubmitSignedDeposit: {
                        target: "SubmittingDeposit",
                        actions: assign(({ event }: any) => {
                          assertEvent(event, "SubmitSignedDeposit");
                          return { signedDepositTx: event.tx as Transaction };
                        }),
                      },
                      DepositSubmittedExternally: {
                        target: "AwaitingCommitConfirmation",
                      },
                    },
                  },

                  SubmittingDeposit: {
                    invoke: {
                      src: "submitCardanoTx",
                      input: ({ context }: any) => ({
                        client: context.client,
                        tx: context.signedDepositTx as Transaction,
                        path: context.submitPath,
                      }),
                      onDone: { target: "AwaitingCommitConfirmation" },
                      onError: {
                        target: "AwaitSignature",
                        actions: "setError",
                      },
                    },
                  },

                  AwaitingCommitConfirmation: {
                    on: {
                      Message: {
                        guard: "isIncrementalCommitEvent",
                        target: "Done",
                        actions: ["clearRequest", "clearDraftTx"],
                      },
                    },
                  },

                  Done: { type: "final" as const },
                },
                onDone: {
                  // Return to Active after successful incremental commit
                  target: "Active",
                },
              },
            },
          },

          Closed: {
            on: {
              Contest: { actions: ["clearError", "contestHead"] },
              Message: [
                {
                  guard: "isContested",
                  // Stay in Closed state, just update internal state
                  actions: [],
                },
              ],
            },
          },

          FanoutPossible: {
            on: {
              Fanout: { actions: ["clearError", "fanoutHead"] },
            },
          },

          Final: {
            on: {
              Init: { actions: ["clearError", "initHead"] },
            },
          },
        },
      },
    },
  });
}

export const machine = createHydraMachine();
