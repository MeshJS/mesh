import { startAuthentication } from "@simplewebauthn/browser";

export async function login({
  serverUrl,
  username,
}: {
  serverUrl: string;
  username: string;
}) {
  // 1. Get challenge from server
  const initAuthRes = await fetch(`${serverUrl}/init-auth`, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
    }),
  });

  const initAuth = await initAuthRes.json();
  if (!initAuth.success) {
    return {
      success: false,
      error: initAuth.error,
      errorCode: initAuth.errorCode,
    };
  }

  const optionsJSON = initAuth.optionsJSON;

  // 2. Get passkey
  const authJSON = await startAuthentication({ optionsJSON });

  // 3. Verify passkey with DB
  const verifyAuthRes = await fetch(`${serverUrl}/verify-auth`, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(authJSON),
  });

  const verifyAuth = await verifyAuthRes.json();

  if (!verifyAuthRes.ok) {
    return { success: false, error: verifyAuth.error };
  }
  if (verifyAuth.verified) {
    return { success: true, authJSON: authJSON };
  } else {
    return { success: false, error: "Failed to log in" };
  }
}
