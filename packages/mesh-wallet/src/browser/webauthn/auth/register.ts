import { startRegistration } from "@simplewebauthn/browser";

export async function register({
  serverUrl,
  username,
}: {
  serverUrl: string;
  username: string;
}) {
  // 1. Get challenge from server
  const initRegisterRes = await fetch(`${serverUrl}/register-init`, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
    }),
  });
  const initRegister = await initRegisterRes.json();
  if (!initRegister.success) {
    return {
      success: false,
      error: initRegister.error,
      errorCode: initRegister.errorCode,
    };
  }

  // 2. Create passkey
  const optionsJSON = initRegister.data.optionsJSON;
  const registrationJSON = await startRegistration({ optionsJSON });

  // 3. Save passkey in DB
  const verifyResponse = await fetch(`${serverUrl}/register-verify`, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(registrationJSON),
  });

  const verifyData = await verifyResponse.json();
  if (!verifyResponse.ok) {
    console.error(verifyData.error);
    return {
      success: false,
      error: verifyData.error,
      errorCode: verifyData.errorCode,
    };
  }
  if (verifyData.data.verified) {
    console.log(`Successfully registered ${username}`);
    return { success: true };
  } else {
    console.error(`Failed to register`);
    return { success: false, error: "Failed to register", errorCode: 1 };
  }
}
