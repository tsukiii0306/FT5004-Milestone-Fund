# Milestone Fund

Milestone Fund is a milestone-based crowdfunding DApp: **Solidity + Hardhat** on-chain logic, **React (Vite)** frontend, and **MetaMask** for local transactions.

Funds stay in the campaign contract until milestones are approved. Each milestone opens a **weighted vote** (by contribution). Approved milestones trigger a **payout** to the creator (`finalizeVote`). If a vote fails, the campaign enters a **one-time Grace Period**; the creator may **resubmit** once. If the vote fails again—or grace expires without a valid resubmit—the campaign becomes **Failed** and backers may **claim proportional refunds** on the remaining pool.

Developed for the **FT5004** group project.

---

## Features

| Area | Capabilities |
|------|----------------|
| Funding | Contributions during `Funding`; goal vs deadline determines `Active` or `Failed`. |
| Milestones | Creator submits work → `Voting`; payout ratios sum to **100%** (e.g. two milestones: 40 / 60). |
| Voting | Eligible backers (≥ `minContributionToVote`) vote **for / against**; ballot weight = their contributed ETH. |
| Settlement | **No auto-payout**: someone must call **`finalizeVote()`** after the voting window ends. |
| Grace | One grace cycle per milestone after first rejection; optional **resubmit** restarts voting. |
| Failure & refund | On failure, **`claimRefund()`** returns a proportional share of funds not yet released to the creator. |

---

## Architecture

- **`MilestoneFundFactory`** — Deploys `MilestoneFund` clones and records addresses via `getDeployedCampaigns()`.
- **`MilestoneFund`** — Per-campaign state machine (`Funding` → `Active` → `Voting` → … → `Completed` or `Failed`).

Demo timing (factory constants, local only):

- Funding window: **60 s** after campaign creation (deadline set at create time).
- Voting window: **40 s** per voting round (initial submit + each resubmit).
- Grace window: **60 s** after a rejected vote enters grace.

Governance parameters are passed when creating a campaign from the factory (see `frontend/src/utils/constants.js` → `DEFAULT_GOVERNANCE`: e.g. **voting threshold 60%**, **quorum 40%** of total raised weight, **min 0.1 ETH** to vote—**on-chain values always win**).

### Vote approval (after deadline, in `finalizeVote`)

Let `totalVotes = yesVotes + noVotes` (sum of contributor weights who voted), `totalRaised` = total ETH raised.

1. **Quorum:** `totalVotes * 100 >= totalRaised * quorum` (requires `totalRaised > 0` for this check to apply as implemented).
2. **Supermajority among ballots cast:** `yesVotes * 100 >= totalVotes * votingThreshold` (requires `totalVotes > 0`).

Both must hold for **approve**; otherwise the milestone is rejected (grace or final failure as above).

---

## Repository layout

```text
MilestoneFundProjectv2/
├── contracts/
│   ├── MilestoneFund.sol       # Campaign logic
│   └── MilestoneFundFactory.sol
├── scripts/
│   ├── deploy.js               # Deploy factory to localhost
│   └── sync-abi.js             # Copy ABIs into frontend
├── test/
│   └── MilestoneFund.test.js
├── frontend/                   # React + Vite UI
│   ├── src/
│   │   ├── pages/              # Home, Create, Detail (campaign)
│   │   ├── utils/
│   │   │   ├── constants.js    # FACTORY_ADDRESS, ABIs, defaults
│   │   │   ├── MilestoneFund.json
│   │   │   └── MilestoneFundFactory.json
│   │   └── ...
│   └── package.json
├── hardhat.config.js
├── package.json
└── README.md
```

---

## Prerequisites

- **Node.js** (LTS recommended) and npm  
- **MetaMask** (or compatible wallet) for **chain ID `31337`**, RPC **`http://127.0.0.1:8545`**  
- **Hardhat node** running for local chain (`npx hardhat node`)

---

## Setup

From the **project root** (`MilestoneFundProjectv2/`):

```bash
npm install
cd frontend && npm install && cd ..
```

Compile contracts:

```bash
npx hardhat compile
```

Refresh frontend ABIs (after any Solidity change to `MilestoneFund` or `MilestoneFundFactory`):

```bash
npm run sync-abi
```

This writes:

- `frontend/src/utils/MilestoneFund.json`
- `frontend/src/utils/MilestoneFundFactory.json`
- `frontend/src/contracts/milestoneFundAbi.json`

---

## Run tests

```bash
npx hardhat test
```

The suite includes deployment, funding, voting, grace, refunds, completion, and a **full demo flow** (15 tests at last update).

---

## Local demo: chain + deploy + UI

**Terminal 1 — keep Hardhat running**

```bash
npx hardhat node
```

**Terminal 2 — deploy factory**

```bash
npx hardhat run scripts/deploy.js --network localhost
```

Copy the printed **factory address** into `frontend/src/utils/constants.js` as **`FACTORY_ADDRESS`**.

**Terminal 3 — frontend**

```bash
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**). In MetaMask, add/import the **Hardhat Local** network (**31337**, **http://127.0.0.1:8545**) and use an account funded from the Hardhat node (see Hardhat console accounts).

- **Home** — lists campaigns from the factory (read-only JSON-RPC, same host as above).  
- **Create** — deploys a new campaign via the factory (wallet required).  
- **Campaign detail** — reads state via RPC; **contributions / votes / finalize / refunds** need a connected wallet.

Production build:

```bash
npm run build:frontend
```

---

## Important files

| File | Role |
|------|------|
| `contracts/MilestoneFund.sol` | Campaign state, voting, payouts, grace, refunds |
| `contracts/MilestoneFundFactory.sol` | `createCampaign`, fixed demo durations |
| `scripts/deploy.js` | Deploy **factory** only |
| `scripts/sync-abi.js` | Sync compiled ABIs into `frontend/` |
| `test/MilestoneFund.test.js` | Regression + demo flow tests |
| `frontend/src/utils/constants.js` | `FACTORY_ADDRESS`, imported ABIs, UI defaults |

---

## Notes

- Designed primarily for **local Hardhat** presentation and coursework; **testnet/mainnet** would need config, verification, and parameter review.  
- If the UI and chain **ABI or bytecode drift** (old addresses + new ABI), reads or transactions can fail—recompile, `npm run sync-abi`, redeploy factory, and create **new** campaigns for a clean match.
