/** Hardhat default local network */
export const EXPECTED_CHAIN_ID = 31337;
export const EXPECTED_CHAIN_ID_HEX = "0x7a69";

export const HARDHAT_LOCAL_NETWORK = {
  chainId: EXPECTED_CHAIN_ID_HEX,
  chainName: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["http://127.0.0.1:8545"],
};

/** Same URL as in `HARDHAT_LOCAL_NETWORK` — use for read-only calls (e.g. campaign list) so it matches WalletBanner copy. */
export const HARDHAT_JSON_RPC_URL = HARDHAT_LOCAL_NETWORK.rpcUrls[0];
