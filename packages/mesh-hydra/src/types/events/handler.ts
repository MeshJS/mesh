import { ClientMessage } from "../client-message";

export  function handleHydraErrors(
  msg: ClientMessage,
  reject: (reason?: any) => void,
) {

  if (msg.tag === "CommandFailed") {
    const inputTag = msg.clientInput?.tag ?? "UnknownInput";
    reject(new Error(`[Hydra] Command failed (${inputTag})`));
    return true;
  }

  if (msg.tag === "PostTxOnChainFailed") {
    const error = msg.postTxError as any;
    let reason = "Unknown on-chain error";
    if (typeof error?.failureReason === "string") {
      reason = error.failureReason;
    } else if (typeof error?.reason === "string") {
      reason = error.reason;
    } else if (typeof error?.tag === "string") {
      reason = error.tag;
    }
    reject(new Error(`[Hydra] PostTxOnChainFailed (${reason})`));
    return true;
  }


  return false;
}
