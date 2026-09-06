import { createConfig, http, injected } from "wagmi";
import { baseSepolia, foundry } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [foundry, baseSepolia],
  connectors: [injected()],
  transports: {
    [foundry.id]: http(),
    [baseSepolia.id]: http(),
  },
});
