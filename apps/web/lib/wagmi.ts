import { createConfig, http, injected } from "wagmi";
import { base, foundry } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [foundry, base],
  connectors: [injected()],
  transports: {
    [foundry.id]: http(),
    [base.id]: http(),
  },
});
