// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";
import babel from "@rollup/plugin-babel";
import typescript from "@rollup/plugin-typescript";
import react from "@vitejs/plugin-react";
var __vite_injected_original_dirname = "/Users/whatever/Desktop/WorkDev/meshjs/mesh/packages/react";
var vite_config_default = defineConfig({
  build: {
    lib: {
      entry: "./src/index.ts",
      formats: ["cjs", "es"]
    },
    rollupOptions: {
      external: [
        "@meshsdk/core",
        "react",
        "react-dom"
      ],
      output: {
        globals: {
          react: "React"
        }
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          extensions: [".ts", ".tsx"]
        }),
        typescript({
          outputToFilesystem: false
        })
      ]
    },
    target: ["esnext"]
  },
  resolve: {
    alias: {
      "@mesh": resolve(__vite_injected_original_dirname, "./src")
    }
  },
  plugins: [
    react()
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvd2hhdGV2ZXIvRGVza3RvcC9Xb3JrRGV2L21lc2hqcy9tZXNoL3BhY2thZ2VzL3JlYWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvd2hhdGV2ZXIvRGVza3RvcC9Xb3JrRGV2L21lc2hqcy9tZXNoL3BhY2thZ2VzL3JlYWN0L3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy93aGF0ZXZlci9EZXNrdG9wL1dvcmtEZXYvbWVzaGpzL21lc2gvcGFja2FnZXMvcmVhY3Qvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCBiYWJlbCBmcm9tICdAcm9sbHVwL3BsdWdpbi1iYWJlbCc7XG5pbXBvcnQgdHlwZXNjcmlwdCBmcm9tICdAcm9sbHVwL3BsdWdpbi10eXBlc2NyaXB0JztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIGJ1aWxkOiB7XG4gICAgbGliOiB7XG4gICAgICBlbnRyeTogJy4vc3JjL2luZGV4LnRzJyxcbiAgICAgIGZvcm1hdHM6IFsnY2pzJywgJ2VzJ10sXG4gICAgfSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBleHRlcm5hbDogW1xuICAgICAgICAnQG1lc2hzZGsvY29yZScsXG4gICAgICAgICdyZWFjdCcsICdyZWFjdC1kb20nLFxuICAgICAgXSxcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBnbG9iYWxzOiB7XG4gICAgICAgICAgcmVhY3Q6ICdSZWFjdCcsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcGx1Z2luczogW1xuICAgICAgICBiYWJlbCh7XG4gICAgICAgICAgYmFiZWxIZWxwZXJzOiAnYnVuZGxlZCcsXG4gICAgICAgICAgZXh0ZW5zaW9uczogWycudHMnLCAnLnRzeCddLFxuICAgICAgICB9KSxcbiAgICAgICAgdHlwZXNjcmlwdCh7XG4gICAgICAgICAgb3V0cHV0VG9GaWxlc3lzdGVtOiBmYWxzZSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0sXG4gICAgdGFyZ2V0OiBbJ2VzbmV4dCddLFxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAbWVzaCc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKSxcbiAgICB9LFxuICB9LFxuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgXSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFnVyxTQUFTLGVBQWU7QUFDeFgsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sZ0JBQWdCO0FBQ3ZCLE9BQU8sV0FBVztBQUpsQixJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixPQUFPO0FBQUEsSUFDTCxLQUFLO0FBQUEsTUFDSCxPQUFPO0FBQUEsTUFDUCxTQUFTLENBQUMsT0FBTyxJQUFJO0FBQUEsSUFDdkI7QUFBQSxJQUNBLGVBQWU7QUFBQSxNQUNiLFVBQVU7QUFBQSxRQUNSO0FBQUEsUUFDQTtBQUFBLFFBQVM7QUFBQSxNQUNYO0FBQUEsTUFDQSxRQUFRO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNQLE1BQU07QUFBQSxVQUNKLGNBQWM7QUFBQSxVQUNkLFlBQVksQ0FBQyxPQUFPLE1BQU07QUFBQSxRQUM1QixDQUFDO0FBQUEsUUFDRCxXQUFXO0FBQUEsVUFDVCxvQkFBb0I7QUFBQSxRQUN0QixDQUFDO0FBQUEsTUFDSDtBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVEsQ0FBQyxRQUFRO0FBQUEsRUFDbkI7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLFNBQVMsUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDckM7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsRUFDUjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
