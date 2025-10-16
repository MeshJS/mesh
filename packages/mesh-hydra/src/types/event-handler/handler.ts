import { ServerOutput } from "../server-output";
import { commitHandlers } from "./commit";
import { decommitHandlers } from "./decommit";
import { depositHandlers } from "./deposit";
import { greetingsHandlers } from "./greetings";
import { headCycleHandlers } from "./head";
import { networkHandlers } from "./network";
import { snapshotHandlers } from "./snapshot";
import { transactionHandlers } from "./transaction";

export type HandlerMap<
  TUnion extends { tag: string },
  Prefix extends string,
> = {
  [K in Extract<TUnion["tag"], `${Prefix}${string}`>]: (
    msg: Extract<TUnion, { tag: K }>
  ) => void;
};

export const handlers = {
  commit: commitHandlers,
  decommit: decommitHandlers,
  deposit: depositHandlers,
  head: headCycleHandlers,
  network: networkHandlers,
  snapshot: snapshotHandlers,
  transaction: transactionHandlers,
  greetings: greetingsHandlers,
} as const;

export const getEventsGroup = (
  tag: string
): keyof typeof handlers | undefined => {
  const tagLower = tag.toLowerCase();
  for (const group of Object.keys(handlers)) {
    if (tagLower.startsWith(group.toLowerCase()))
      return group as keyof typeof handlers;
  }
  return undefined;
};

export async function handleMessage(msg: ServerOutput, eventEmitter: any) {
  const group = getEventsGroup(msg.tag);
  eventEmitter.emit("onmessage", msg);

  if (group) {
    eventEmitter.emit(`onmessage.${group}`, msg);
    eventEmitter.emit(`onmessage.${group}.${msg.tag}`, msg);
  }
}

export const createAllMessage = (
  callback: (msg: ServerOutput) => void,
  eventEmitter: any
) => {
  eventEmitter.on("onmessage", callback);
};

export function createtypedMessage(eventEmitter: any) {
  return Object.fromEntries(
    Object.entries(handlers).map(([group, map]) => [
      group,
      Object.fromEntries(
        Object.keys(map).map((tag) => [
          tag,
          (callback: (msg: any) => void) =>
            eventEmitter.on(`onmessage.${group}.${tag}`, callback),
        ])
      ),
    ])
  ) as {
    [K in keyof typeof handlers]: {
      [T in keyof HandlerMap<ServerOutput, Capitalize<K & string>>]: (
        callback: (msg: Extract<ServerOutput, { tag: T }>) => void
      ) => void;
    };
  };
}

export function createOnMessage(eventEmitter: any) {
  const onAnyMessage = (callback: (msg: ServerOutput) => void) =>
    createAllMessage(callback, eventEmitter);
  const typed = createtypedMessage(eventEmitter);
  return Object.assign(onAnyMessage, typed);
}
