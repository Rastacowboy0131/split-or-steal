import { createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { defineChain } from "viem";

// Robinhood chain placeholder config. Update chainId + RPC when known.
export const robinhoodChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_RH_CHAIN_ID || 0) || 46886,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RH_RPC_URL || "https://rpc.placeholder.robinhood.example"] },
  },
});

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: { [robinhoodChain.id]: http() },
});

// Contract address placeholder: empty string means demo mode (mock data).
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_SOS_CONTRACT || "";
export const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SOS_TOKEN || "";
export const DEMO_MODE = !CONTRACT_ADDRESS;

export const CONTRACT_ABI = [
  { name: "jackpot", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getRoom", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [
    { name: "minHold", type: "uint256" }, { name: "roundPotSize", type: "uint256" }, { name: "cooldownSecs", type: "uint64" }, { name: "enabled", type: "bool" } ] }] },
  { name: "joinQueue", type: "function", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { name: "commit", type: "function", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "bytes32" }], outputs: [] },
  { name: "reveal", type: "function", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint8" }, { type: "bytes32" }], outputs: [] },
];
