//* Libraries imports
import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".output/**", ".wxt/**"],
  },
});
