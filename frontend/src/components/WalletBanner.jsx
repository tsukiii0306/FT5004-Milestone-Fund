import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { EXPECTED_CHAIN_ID, EXPECTED_CHAIN_ID_HEX, HARDHAT_LOCAL_NETWORK } from "../utils/chain";

function parseChainId(hex) {
  if (!hex || typeof hex !== "string") return null;
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) ? n : null;
}

export default function WalletBanner() {
  const { pathname } = useLocation();
  const needsWallet = pathname.startsWith("/create") || pathname.startsWith("/campaign/");
  const [kind, setKind] = useState(null); // 'no-wallet' | 'wrong-chain' | null

  const refresh = useCallback(async () => {
    if (!needsWallet) {
      setKind(null);
      return;
    }
    if (!window.ethereum) {
      setKind("no-wallet");
      return;
    }
    try {
      const hex = await window.ethereum.request({ method: "eth_chainId" });
      const id = parseChainId(hex);
      setKind(id === EXPECTED_CHAIN_ID ? null : "wrong-chain");
    } catch {
      setKind("wrong-chain");
    }
  }, [needsWallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return undefined;
    const onChange = () => refresh();
    eth.on("chainChanged", onChange);
    eth.on("accountsChanged", onChange);
    return () => {
      eth.removeListener("chainChanged", onChange);
      eth.removeListener("accountsChanged", onChange);
    };
  }, [refresh]);

  const switchChain = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: EXPECTED_CHAIN_ID_HEX }],
      });
    } catch (e) {
      if (e?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [HARDHAT_LOCAL_NETWORK],
        });
      }
    }
    refresh();
  };

  if (!needsWallet || !kind) return null;

  return (
    <div className={`mf-banner ${kind === "no-wallet" ? "mf-banner--error" : "mf-banner--warn"}`} role="status">
      <div className="mf-banner__inner">
        {kind === "no-wallet" ? (
          <>
            <strong>No wallet detected.</strong> Install MetaMask (or another injected wallet) to create campaigns or transact.
            <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="mf-banner__link">
              Get MetaMask
            </a>
          </>
        ) : (
          <>
            <strong>Wrong network.</strong> This app expects <span className="mf-tabular">Hardhat Local</span> (chain ID {EXPECTED_CHAIN_ID}, RPC http://127.0.0.1:8545).
            <button type="button" className="mf-btn mf-btn--secondary mf-btn--small mf-banner__action" onClick={switchChain}>
              Switch network
            </button>
          </>
        )}
      </div>
    </div>
  );
}
