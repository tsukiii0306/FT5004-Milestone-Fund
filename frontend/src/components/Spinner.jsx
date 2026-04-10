/** Inline loading indicator for primary (light) and outline/ghost (dark) buttons */
export function Spinner({ tone = "light" }) {
  return <span className={`gf-spinner gf-spinner--${tone}`} aria-hidden />;
}
