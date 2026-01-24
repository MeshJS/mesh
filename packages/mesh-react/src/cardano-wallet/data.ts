export const screens = {
  main: {
    title: "Connect Wallet",
    subtitle: undefined as string | undefined,
  },
  burner: {
    title: "Burner Wallet",
    subtitle:
      "Instantly create a new burner wallet. No seed phrase required, keys are generated on your device.",
  },
  webauthn: {
    title: "Passkey",
    subtitle:
      "Derive self-custody wallet on Chrome, Safari, or Firefox browsers on Android, iOS, macOS, and Windows devices, or using password managers.",
  },
} as const;

export type ScreenKey = keyof typeof screens;
