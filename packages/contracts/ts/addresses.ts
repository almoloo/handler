export const addresses = {
  31337: { handlerWallet: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", factory: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9" }, // anvil/dev
  84532: { handlerWallet: "0x99fE6372a31983366863fb31e4dA27d0D51f7e84", factory: "0x..." }, // Base Sepolia — dead, no longer the public chain (ERC-8004 has no code there); left as-is, see context/current-feature.md
  8453: { handlerWallet: "0xFeBE3af214EDE404A467E7b6f038595fd5ACA0Bb", factory: "0xA65BbB8a2C8fdb4a1cFe50A59Ae8f552E7e70c1f" }, // Base mainnet — the real public chain (script/DeployBase.s.sol)
} as const;
