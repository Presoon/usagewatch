import { defineConfig } from "vitest/config";

// Standalone config so tests don't pull in the React/Tailwind Vite plugins.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
