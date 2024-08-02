import { persistNSync } from "persist-and-sync";
import { create } from "zustand";

interface State {
  isDark: boolean;
  setDarkMode: (isDark: boolean) => void;
}

export const useDarkmode = create<State>(
  persistNSync(
    (set) => ({
      isDark: false,
      setDarkMode: (bool) => set((state) => ({ isDark: bool })),
    }),
    { name: "mesh-darkmode" },
  ),
);
