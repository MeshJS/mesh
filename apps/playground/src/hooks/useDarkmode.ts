import { create } from "zustand";
import { persist } from "zustand/middleware";

interface State {
  isDark: boolean;
  setDarkMode: (isDark: boolean) => void;
}

export const useDarkmode = create<State>()(
  persist(
    (set, get) => ({
      isDark: false,
      setDarkMode: (bool) => set((state) => ({ isDark: bool })),
    }),
    {
      name: "mesh-darkmode",
    },
  ),
);
