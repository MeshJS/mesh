import { CommandFailed } from "./events/command-failed";
import { PostTxOnChainFailed } from "./events/post-tx-failed";

export type ClientMessage = PostTxOnChainFailed | CommandFailed;