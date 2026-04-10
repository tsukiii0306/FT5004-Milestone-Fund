import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ethers } from "ethers";
import {
  FACTORY_ADDRESS,
  factoryABI,
  milestoneFundABI,
  HIDE_ALL_FACTORY_CAMPAIGNS,
  HIDDEN_FACTORY_CAMPAIGN_INDICES,
} from "../utils/constants";
import { HARDHAT_JSON_RPC_URL } from "../utils/chain";
import { secondsRemaining, formatDuration, formatDateTime } from "../utils/time";
import CopyableAddress from "../components/CopyableAddress";

const STATUS_LABELS = ["Funding", "Active", "Voting", "Grace period", "Failed", "Completed"];
const BADGE_CLASS = [
  "mf-badge--funding",
  "mf-badge--active",
  "mf-badge--voting",
  "mf-badge--grace",
  "mf-badge--failed",
  "mf-badge--completed",
];

function n(v) {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : Number(v);
}

function chainNowSec() {
  return Math.floor(Date.now() / 1000);
}

export default function Detail() {
  const { address } = useParams();
  const [account, setAccount] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [details, setDetails] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [amount, setAmount] = useState("");
  const [userContribution, setUserContribution] = useState("0");
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [hasVotedThisRound, setHasVotedThisRound] = useState(false);
  const [delistedCampaign, setDelistedCampaign] = useState(false);
  const [refundInfo, setRefundInfo] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const graceExpireAutoFetchDoneRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [address]);

  useEffect(() => {
    graceExpireAutoFetchDoneRef.current = false;
  }, [address]);

  const fetchCampaignData = useCallback(async () => {
    setLoadError(null);
    try {
      if (!address || !ethers.isAddress(address)) {
        setLoadError("Invalid address in URL.");
        setDetails(null);
        return;
      }

      // Same reads as Home — works without MetaMask as long as Hardhat RPC is up.
      const readProvider = new ethers.JsonRpcProvider(HARDHAT_JSON_RPC_URL);
      let signer = null;
      let currentAddress = "";
      if (window.ethereum) {
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum);
          signer = await browserProvider.getSigner();
          currentAddress = (await signer.getAddress()).toLowerCase();
        } catch {
          /* wallet not connected — show campaign read-only */
        }
      }

      const factory = new ethers.Contract(FACTORY_ADDRESS, factoryABI, readProvider);
      const deployed = await factory.getDeployedCampaigns();
      const target = String(address).toLowerCase();
      const inFactory = deployed.some((a) => a && String(a).toLowerCase() === target);
      const delisted = HIDE_ALL_FACTORY_CAMPAIGNS
        ? inFactory
        : HIDDEN_FACTORY_CAMPAIGN_INDICES.some(
            (i) => deployed[i] && String(deployed[i]).toLowerCase() === target
          );
      if (delisted) {
        setDelistedCampaign(true);
        setDetails(null);
        setMilestones([]);
        setHasVotedThisRound(false);
        setRefundInfo(null);
        return;
      }
      setDelistedCampaign(false);

      setAccount(currentAddress);

      const contract = new ethers.Contract(address, milestoneFundABI, readProvider);

      let info = await contract.getCampaignInfo();
      let milestoneTotal = n(await contract.getMilestoneCount());
      let rawStatus = n(info.status ?? info[7]);
      let effectiveStatus = rawStatus;
      try {
        effectiveStatus = n(await contract.getEffectiveStatus());
      } catch {
        effectiveStatus = rawStatus;
      }

      if (signer && rawStatus === 3 && effectiveStatus === 4) {
        try {
          const write = new ethers.Contract(address, milestoneFundABI, signer);
          const tx = await write.syncExpiredGrace();
          await tx.wait();
          info = await contract.getCampaignInfo();
          milestoneTotal = n(await contract.getMilestoneCount());
          rawStatus = n(info.status ?? info[7]);
          effectiveStatus = rawStatus;
          try {
            effectiveStatus = n(await contract.getEffectiveStatus());
          } catch {
            effectiveStatus = rawStatus;
          }
        } catch (e) {
          console.warn("syncExpiredGrace:", e);
        }
      }

      const creatorAddr = String(info.creator ?? info[0]).toLowerCase();
      const releasedWei = info.releasedAmount ?? info[14];
      setDetails({
        creator: info.creator ?? info[0],
        title: info.title ?? info[1],
        description: info.description ?? info[2],
        goal: ethers.formatEther(info.fundingGoal ?? info[3]),
        raised: ethers.formatEther(info.totalRaised ?? info[4]),
        deadline: n(info.deadline ?? info[5]),
        currentMilestone: n(info.currentMilestone ?? info[6]),
        status: effectiveStatus,
        rawStatus,
        minVoteAmount: ethers.formatEther(
          (() => {
            const v = info.minContributionToVote ?? info[10];
            return v != null ? v : 0n;
          })()
        ),
        milestoneCount: milestoneTotal,
        releasedToCreator: ethers.formatEther(releasedWei != null ? releasedWei : 0n),
      });

      setIsCreator(Boolean(currentAddress) && currentAddress === creatorAddr);

      if (currentAddress) {
        const myContrib = await contract.getBackerContribution(currentAddress);
        setUserContribution(ethers.formatEther(myContrib));
      } else {
        setUserContribution("0");
      }

      const mList = [];
      for (let i = 0; i < milestoneTotal; i++) {
        mList.push(await contract.getMilestoneInfo(i));
      }
      setMilestones(mList);

      const curIdx = n(info.currentMilestone ?? info[6]);
      let voted = false;
      if (currentAddress && rawStatus === 2 && curIdx < milestoneTotal) {
        try {
          const ms = await contract.milestones(curIdx);
          const voteRound = ms.voteRound ?? ms[7];
          voted = await contract.hasVoted(curIdx, voteRound, currentAddress);
        } catch {
          voted = false;
        }
      }
      setHasVotedThisRound(voted);

      const graceDeadlineSec =
        curIdx < mList.length && mList[curIdx] ? Number(mList[curIdx][4]) : 0;
      const failedByGraceDeadline =
        rawStatus === 3 && graceDeadlineSec > 0 && chainNowSec() > graceDeadlineSec;
      const showRefund = effectiveStatus === 4 || failedByGraceDeadline;

      if (showRefund && currentAddress) {
        try {
          const refWei = await contract.getRefundableAmount(currentAddress);
          let claimed = false;
          let claimedAmountEth = null;
          try {
            const backerRow = await contract.backers(currentAddress);
            claimed = Boolean(backerRow.refundClaimed ?? backerRow[1]);
            if (claimed) {
              const filter = contract.filters.RefundClaimed(currentAddress);
              const evs = await contract.queryFilter(filter);
              if (evs.length > 0) {
                const last = evs[evs.length - 1];
                const argAmt = last.args?.amount ?? last.args[1];
                claimedAmountEth = ethers.formatEther(argAmt);
              }
            }
          } catch {
            /* older ABI / RPC limits */
          }
          setRefundInfo({
            refundable: ethers.formatEther(refWei),
            refundClaimed: claimed,
            claimedAmountEth,
          });
        } catch {
          setRefundInfo(null);
        }
      } else {
        setRefundInfo(null);
      }
    } catch (error) {
      console.error("Data fetch failed:", error);
      setDetails(null);
      setMilestones([]);
      setLoadError(
        error?.reason ||
          error?.shortMessage ||
          error?.message ||
          "Could not read this contract. Redeploy MilestoneFund with the latest code or check the address / RPC."
      );
    }
  }, [address]);

  useEffect(() => {
    if (!details || details.rawStatus !== 3) return;
    if (!milestones.length) return;
    const cur = milestones[details.currentMilestone];
    const g = cur ? Number(cur[4]) : 0;
    if (g > 0 && chainNowSec() <= g) {
      graceExpireAutoFetchDoneRef.current = false;
      return;
    }
    if (!g || chainNowSec() <= g) return;
    if (graceExpireAutoFetchDoneRef.current) return;
    graceExpireAutoFetchDoneRef.current = true;
    fetchCampaignData();
  }, [tick, details, milestones, fetchCampaignData]);

  useEffect(() => {
    fetchCampaignData();
    const eth = window.ethereum;
    if (!eth?.on) return undefined;
    const onAccounts = () => {
      fetchCampaignData();
    };
    eth.on("accountsChanged", onAccounts);
    return () => {
      eth.removeListener("accountsChanged", onAccounts);
    };
  }, [fetchCampaignData]);

  const handleAction = async (methodName, ...args) => {
    if (!window.ethereum) {
      alert("Install MetaMask (or another wallet) and connect to send transactions.");
      return;
    }
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(address, milestoneFundABI, signer);

      const tx = await contract[methodName](...args);
      await tx.wait();

      alert("Transaction successful!");
      fetchCampaignData();
    } catch (err) {
      alert("Transaction failed: " + (err.reason || err.message));
    }
    setLoading(false);
  };

  if (loadError && !details) {
    return (
      <div className="mf-card-page">
        <p className="mf-hint-warn">{loadError}</p>
        <p className="mf-muted" style={{ marginTop: "0.75rem" }}>
          If you just updated the app, recompile with{" "}
          <code className="mf-mono">npx hardhat compile</code>, run <code className="mf-mono">npm run sync-abi</code>, redeploy the factory, then create a new campaign.
        </p>
        <Link to="/" className="mf-btn mf-btn--primary" style={{ marginTop: "1rem", display: "inline-flex" }}>
          Back to campaigns
        </Link>
      </div>
    );
  }

  if (delistedCampaign) {
    return (
      <div className="mf-card-page">
        <p className="mf-muted">This campaign is not available in this app.</p>
        <Link to="/" className="mf-btn mf-btn--primary" style={{ marginTop: "1rem", display: "inline-flex" }}>
          Back to campaigns
        </Link>
      </div>
    );
  }

  if (!details) {
    return <p className="mf-loading">Loading on-chain data…</p>;
  }

  const progress = Math.min((details.raised / details.goal) * 100, 100);
  const curMilestone = milestones[details.currentMilestone];
  const voteEnd = curMilestone ? Number(curMilestone[3]) : 0;
  const graceEnd = curMilestone ? Number(curMilestone[4]) : 0;
  const rawStatusStored = details.rawStatus ?? details.status;
  const failedAfterGraceNoResubmit =
    rawStatusStored === 3 && graceEnd > 0 && chainNowSec() > graceEnd;
  const st = failedAfterGraceNoResubmit ? 4 : details.status;
  const badgeMod = BADGE_CLASS[st] ?? "";
  const votingOpen = st === 2 && voteEnd > 0 && chainNowSec() <= voteEnd;
  const voteFinalizable = st === 2 && voteEnd > 0 && chainNowSec() > voteEnd;
  const graceOpen = rawStatusStored === 3 && graceEnd > 0 && chainNowSec() <= graceEnd;
  const eligibleToVote = Number(userContribution) >= Number(details.minVoteAmount);

  return (
    <div className="mf-card-page">
      <div className="mf-title-row">
        <h1>{details.title}</h1>
        <span className={`mf-badge ${badgeMod}`}>{STATUS_LABELS[st]}</span>
      </div>
      <p className="mf-subtitle">{details.description}</p>
      <CopyableAddress address={address} label="Campaign contract" className="mf-contract-line" />

      <div className="mf-progress">
        <div className="mf-progress__fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="mf-stat-line mf-tabular">
        Raised <strong>{details.raised} ETH</strong> of <strong>{details.goal} ETH</strong> · {progress.toFixed(1)}%
      </p>
      <p className="mf-stat-line mf-tabular mf-muted" style={{ marginTop: "-0.75rem", fontSize: "0.875rem" }}>
        Released to creator <strong className="mf-tabular" style={{ color: "var(--mf-text)" }}>{details.releasedToCreator} ETH</strong>
        {" "}
        <span className="mf-muted">(cumulative after each finalized milestone)</span>
      </p>

      <div className="mf-callout">
        <h3>On-chain timing</h3>
        {st === 0 && details.deadline > 0 && (
          <p>
            <strong>Funding closes</strong> {formatDateTime(details.deadline)}
            {secondsRemaining(details.deadline) > 0
              ? ` · ${formatDuration(secondsRemaining(details.deadline))} remaining`
              : " · closed (you may finalize funding)"}
          </p>
        )}
        {st === 1 && (
          <p>
            Next milestone to submit: <strong>{details.currentMilestone + 1}</strong>. Voting length was fixed at creation.
          </p>
        )}
        {st === 2 && voteEnd > 0 && (
          <p>
            <strong>Voting ends</strong> {formatDateTime(voteEnd)}
            {secondsRemaining(voteEnd) > 0
              ? ` · ${formatDuration(secondsRemaining(voteEnd))} remaining`
              : " · ended (finalize vote)"}
          </p>
        )}
        {st === 3 && graceEnd > 0 && (
          <p>
            <strong>Grace period ends</strong> {formatDateTime(graceEnd)}
            {secondsRemaining(graceEnd) > 0
              ? ` · ${formatDuration(secondsRemaining(graceEnd))} remaining`
              : " · expired — campaign failed (no resubmit in time)"}
          </p>
        )}
        {(st === 4 || st === 5) && <p>No active countdown.</p>}
      </div>

      <h2 className="mf-heading">Milestones ({details.milestoneCount})</h2>
      <div className="mf-grid mf-grid--milestones" style={{ marginBottom: "1.5rem" }}>
        {milestones.map((m, i) => (
          <div key={i} className={`mf-milestone ${details.currentMilestone === i ? "mf-milestone--current" : ""}`}>
            <div className="mf-milestone__head">
              <h4>Milestone {i + 1}</h4>
              {details.currentMilestone === i ? <span className="mf-pill">Current</span> : null}
            </div>
            <p className="mf-milestone__meta">Payout {m[0].toString()}%</p>
            <p className="mf-milestone__meta mf-milestone__yes mf-tabular">Yes · {ethers.formatEther(m[1])} ETH</p>
            <p className="mf-milestone__meta mf-milestone__no mf-tabular">No · {ethers.formatEther(m[2])} ETH</p>
            <div className={`mf-milestone__state ${m[6] ? "mf-milestone__state--done" : ""}`}>{m[6] ? "Released" : "Locked"}</div>
            {Number(m[3]) > 0 && (
              <p className="mf-milestone__time">
                Vote until {formatDateTime(Number(m[3]))}
                {secondsRemaining(Number(m[3])) > 0 ? ` · ${formatDuration(secondsRemaining(Number(m[3])))} left` : " · closed"}
              </p>
            )}
            {Number(m[4]) > 0 && (
              <p className="mf-milestone__time">
                Grace until {formatDateTime(Number(m[4]))}
                {secondsRemaining(Number(m[4])) > 0 ? ` · ${formatDuration(secondsRemaining(Number(m[4])))} left` : " · closed"}
              </p>
            )}
          </div>
        ))}
      </div>

      <hr className="mf-hr" />

      {isCreator ? (
        <div className="mf-panel mf-panel--creator">
          <h3>Creator</h3>
          <CopyableAddress address={account} label="Your wallet" />
          <div className="mf-actions">
            {st === 0 && (
              <button type="button" onClick={() => handleAction("manualFinalizeFunding")} disabled={loading} className="mf-btn mf-btn--danger">
                {loading ? "…" : "Finalize funding"}
              </button>
            )}
            {st === 1 && (
              <button type="button" onClick={() => handleAction("submitMilestone")} disabled={loading} className="mf-btn mf-btn--secondary">
                {loading ? "…" : `Submit milestone ${details.currentMilestone + 1}`}
              </button>
            )}
            {st === 2 && (
              <button
                type="button"
                onClick={() => handleAction("finalizeVote")}
                disabled={loading || !voteFinalizable}
                className="mf-btn mf-btn--primary"
              >
                {loading ? "…" : "Finalize vote"}
              </button>
            )}
            {st === 3 && graceOpen && (
              <button type="button" onClick={() => handleAction("resubmitMilestone")} disabled={loading} className="mf-btn mf-btn--secondary">
                {loading ? "…" : "Resubmit milestone"}
              </button>
            )}
            {st > 3 && <p className="mf-hint-idle">Campaign finished. No actions.</p>}
          </div>
        </div>
      ) : (
        <div className="mf-panel mf-panel--backer">
          <h3>Backer</h3>
          <CopyableAddress address={account} label="Your wallet" />
          <p className="mf-muted mf-tabular">
            Contributed <strong>{userContribution} ETH</strong>
          </p>

          {st === 0 && (
            <form
              className="mf-form-inline"
              style={{ marginTop: "1rem" }}
              onSubmit={(e) => {
                e.preventDefault();
                handleAction("contribute", { value: ethers.parseEther(amount) });
              }}
            >
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="ETH amount"
                className="mf-input mf-tabular"
              />
              <button type="submit" disabled={loading} className="mf-btn mf-btn--primary">
                {loading ? "…" : "Contribute"}
              </button>
            </form>
          )}

          {st === 2 && (
            <div className="mf-vote-simple" style={{ marginTop: "1rem" }}>
              {!eligibleToVote ? (
                <p className="mf-hint-warn mf-tabular">
                  Minimum contribution to vote: <strong>{details.minVoteAmount} ETH</strong>
                </p>
              ) : hasVotedThisRound ? (
                <p className="mf-muted">Vote recorded.</p>
              ) : !votingOpen ? (
                <p className="mf-hint-idle mf-tabular">Voting ended.</p>
              ) : (
                <div className="mf-vote-actions mf-vote-actions--simple">
                  <button
                    type="button"
                    onClick={() => handleAction("voteMilestone", true)}
                    disabled={loading || !votingOpen}
                    className="mf-btn mf-btn--primary mf-btn--grow"
                  >
                    {loading ? "…" : "Vote for"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction("voteMilestone", false)}
                    disabled={loading || !votingOpen}
                    className="mf-btn mf-btn--secondary mf-btn--grow"
                  >
                    {loading ? "…" : "Vote against"}
                  </button>
                </div>
              )}
            </div>
          )}

          {st === 4 && refundInfo && (
            <div style={{ marginTop: "1rem" }} className="mf-refund-block">
              {refundInfo.refundClaimed && refundInfo.claimedAmountEth != null ? (
                <p className="mf-muted mf-tabular">
                  Refund received: <strong>{refundInfo.claimedAmountEth} ETH</strong>
                </p>
              ) : refundInfo.refundClaimed ? (
                <p className="mf-muted">Refund claimed.</p>
              ) : Number(refundInfo.refundable) > 0 ? (
                <p className="mf-muted mf-tabular">
                  Your refund: <strong>{refundInfo.refundable} ETH</strong>
                </p>
              ) : Number(userContribution) > 0 ? (
                <p className="mf-hint-idle mf-tabular">No refund for this wallet.</p>
              ) : null}
              {!refundInfo.refundClaimed && Number(refundInfo.refundable) > 0 && (
                <button
                  type="button"
                  onClick={() => handleAction("claimRefund")}
                  disabled={loading}
                  className="mf-btn mf-btn--secondary"
                  style={{ marginTop: "0.75rem" }}
                >
                  {loading ? "…" : "Claim refund"}
                </button>
              )}
            </div>
          )}

          {(st === 1 || st === 5 || (st === 3 && graceOpen)) && (
            <p className="mf-hint-idle" style={{ marginTop: "1rem" }}>
              No action in this phase.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
