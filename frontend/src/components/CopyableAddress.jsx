import { useState, useCallback } from "react";
import { shortAddress } from "../utils/format";

export default function CopyableAddress({ address, label, className = "" }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (!address || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [address]);

  if (!address) return null;

  return (
    <div className={`mf-address-row ${className}`.trim()}>
      {label ? <span className="mf-address-row__label">{label}</span> : null}
      <code className="mf-mono mf-tabular mf-address-row__value" title={address}>
        {shortAddress(address)}
      </code>
      <button type="button" className="mf-btn mf-btn--secondary mf-btn--small" onClick={onCopy} aria-label="Copy full address">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
