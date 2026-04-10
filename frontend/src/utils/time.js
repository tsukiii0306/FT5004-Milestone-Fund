/** @param {number} unixSec chain timestamp (seconds) */
export function secondsRemaining(unixSec) {
  return Math.max(0, Math.floor(unixSec - Date.now() / 1000));
}

export function formatDuration(totalSec) {
  if (totalSec <= 0) return "已到时间";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatDateTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleString("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
