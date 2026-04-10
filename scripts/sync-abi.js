/**
 * After `npx hardhat compile`, copies ABI into the frontend so Vite can bundle without reading gitignored /artifacts.
 * Usage: node scripts/sync-abi.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
function syncArtifact(contractPath, outFile) {
  const artPath = path.join(root, contractPath);
  if (!fs.existsSync(artPath)) {
    console.error("Missing:", contractPath, "— run npx hardhat compile");
    process.exit(1);
  }
  const art = JSON.parse(fs.readFileSync(artPath, "utf8"));
  const outPath = path.join(root, outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(art, null, 2));
  console.log("Synced →", outFile, `(${art.contractName}, ${art.abi.length} ABI entries)`);
}

syncArtifact("artifacts/contracts/MilestoneFund.sol/MilestoneFund.json", "frontend/src/contracts/milestoneFundAbi.json");
syncArtifact("artifacts/contracts/MilestoneFund.sol/MilestoneFund.json", "frontend/src/utils/MilestoneFund.json");
syncArtifact(
  "artifacts/contracts/MilestoneFundFactory.sol/MilestoneFundFactory.json",
  "frontend/src/utils/MilestoneFundFactory.json"
);
