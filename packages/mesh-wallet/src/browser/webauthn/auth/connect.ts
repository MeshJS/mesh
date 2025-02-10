import { buildWalletFromPasskey } from "../cardano/build-wallet-from-passkey";
import { ERRORCODES } from "../common";
import { login } from "./login";
import { register } from "./register";

export async function connect({
  username,
  password,
  serverUrl,
}: {
  username: string;
  password: string;
  serverUrl: string;
}) {
  const responseRegister = await register({ serverUrl, username });
  if (
    responseRegister.success ||
    responseRegister.error.errorCode == ERRORCODES.USEREXISTS
  ) {
    const loginRes = await handleLogin({ serverUrl, username });
    if (loginRes.success && loginRes.authJSON) {
      const wallet = await buildWalletFromPasskey(
        loginRes.authJSON.rawId,
        password,
      );
      return { success: true, wallet: wallet };
    }
  } else {
    return { success: false, error: responseRegister.error };
  }
  return { success: false, error: "Fail to connect" };
}

async function handleLogin({
  serverUrl,
  username,
}: {
  serverUrl: string;
  username: string;
}) {
  const responseLogin = await login({ serverUrl, username });
  if (responseLogin.success && responseLogin.authJSON) {
    const authJSON = responseLogin.authJSON;
    return { success: true, authJSON: authJSON };
  } else {
    return { success: false, error: responseLogin.error };
  }
}
