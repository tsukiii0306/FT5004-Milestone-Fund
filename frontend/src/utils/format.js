/** Lowercase 0x + 40 hex chars */
export function shortAddress(address, head = 6, tail = 4) {
  if (!address || typeof address !== "string") return "";
  const a = address.trim();
  if (a.length < 2 + head + tail) return a;
  return `${a.slice(0, 2 + head)}…${a.slice(-tail)}`;
}
