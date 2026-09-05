import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "ts/generated.ts",
  plugins: [foundry({ project: "." })],
});
