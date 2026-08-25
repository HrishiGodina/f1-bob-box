import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // liveState.ts is pure logic — no DOM needed
  },
});
