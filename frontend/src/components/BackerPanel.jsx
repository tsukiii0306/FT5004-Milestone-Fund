import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { secondsRemaining, formatDuration, formatDateTime } from "../utils/time";
import { Spinner } from "./Spinner";

function BackerEmptyIcon() {
  return (
    <svg className="gf-empty-state__icon" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="20" r="8" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 40c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const BackerPanel = ({ contract, info, account, refresh }) => {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [voteKind, setVoteKind] = useState(null);

  const [myContribution, setMyContribution] = useState(null);
  const [refundable, setRefundable] = useState(null);
  const [milestoneSnap, setMilestoneSnap] = useState(null);
  const [voteRound, setVoteRound] = useState(0);
  const [hasVotedFlag, setHasVotedFlag] = useState(false);

  useEffect(() => {
    if (!contract || !info || !account) return;
    let cancelled = false;

    async function load() {
      try {
        const c = await contract.getBackerContribution(account);
        if (cancelled) return;
        setMyContribution(ethers.formatEther(c));

        if (Number(info.status) === 2) {
          const mi = await contract.getMilestoneInfo(info.currentMilestone);
          const row = await contract.milestones(info.currentMilestone);
          const round = Number(row[7]);
          const voted = await contract.hasVoted(info.currentMilestone, round, account);
          if (cancelled) return;
          setMilestoneSnap({
            payoutRatio: Number(mi[0]),
            yesVotes: ethers.formatEther(mi[1]),
            noVotes: ethers.formatEther(mi[2]),
            votingDeadline: Number(mi[3]),
            graceDeadline: Number(mi[4]),
          });
          setVoteRound(round);
          setHasVotedFlag(voted);
        } else {
          setMilestoneSnap(null);
          setVoteRound(0);
          setHasVotedFlag(false);
        }

        if (Number(info.status) === 4) {
          const r = await contract.getRefundableAmount(account);
          if (cancelled) return;
          setRefundable(ethers.formatEther(r));
        } else {
          setRefundable(null);
        }
      } catch (e) {
        console.error(e);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [contract, info, account, info?.status, info?.currentMilestone]);

  if (!contract) {
    return (
      <div className="gf-panel gf-panel--backer gf-panel--muted">
        <h3 className="gf-panel__title">Backer</h3>
        <p className="gf-panel__hint">
          Wallet is connected, but no MilestoneFund contract was found at the configured address on this network. Fix <code className="gf-mono">CONTRACT_ADDRESS</code> and RPC (localhost 8545 · chain 31337), then refresh.
        </p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="gf-panel gf-panel--backer gf-panel--muted">
        <h3 className="gf-panel__title">Backer</h3>
        <div className="gf-empty-state" role="status">
          <BackerEmptyIcon />
          <p className="gf-empty-state__title">No campaign to back yet</p>
          <p className="gf-empty-state__desc">Once a creator deploys a campaign, you can contribute, vote on milestones, and claim refunds if funding fails.</p>
        </div>
      </div>
    );
  }

  const handleContribute = async () => {
    if (!amount) return;
    try {
      setLoading(true);
      const tx = await contract.contribute({ value: ethers.parseEther(amount) });
      await tx.wait();
      alert("Contribution confirmed.");
      setAmount("");
      await refresh();
    } catch (error) {
      console.error(error);
      alert("Contribution failed.");
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (actionFn, successMsg) => {
    try {
      setLoading(true);
      const tx = await actionFn();
      await tx.wait();
      alert(successMsg);
      await refresh();
    } catch (error) {
      console.error(error);
      alert("Transaction failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (approve) => {
    try {
      setVoteKind(approve ? "for" : "against");
      const tx = await contract.voteMilestone(approve);
      await tx.wait();
      alert(approve ? "Voted for." : "Voted against.");
      await refresh();
    } catch (error) {
      console.error(error);
      alert("Transaction failed.");
    } finally {
      setVoteKind(null);
    }
  };

  const st = Number(info.status);
  const goal = parseFloat(info.fundingGoal);
  const raised = parseFloat(info.totalRaised);
  const gap = Math.max(0, goal - raised);

  const voteRemain =
    st === 2 && milestoneSnap?.votingDeadline ? secondsRemaining(milestoneSnap.votingDeadline) : 0;

  const minVote = parseFloat(info.minContributionToVote);
  const myC = myContribution != null ? parseFloat(myContribution) : 0;
  const canVote = myC >= minVote;

  return (
    <div className="gf-panel gf-panel--backer">
      <h3 className="gf-panel__title">Backer actions</h3>

      {st === 0 && (
        <p className="gf-panel__hint">
          Any address can fund during this phase, <strong>including the campaign creator</strong> using the same wallet—the contract does not block it.
        </p>
      )}

      {myContribution != null && (
        <p className="gf-panel__hint">
          Your contribution: <strong>{myContribution} ETH</strong>
          {st === 2 && (
            <span> · {canVote ? "Eligible to vote" : `Need ≥ ${info.minContributionToVote} ETH to vote`}</span>
          )}
        </p>
      )}

      {st === 0 && (
        <div style={{ marginBottom: "4px" }}>
          <p className="gf-panel__hint">
            About <strong>{gap.toFixed(4)} ETH</strong> to goal (target {info.fundingGoal} ETH)
          </p>
          <div className="gf-backer-inline" style={{ marginTop: "10px" }}>
            <label className="gf-form-label" style={{ margin: 0, flex: "0 0 auto" }}>
              <span className="sr-only">Amount</span>
              <div className="gf-input-wrap">
                <input
                  className="gf-input gf-input--mono"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Contribution amount"
                />
                <span className="gf-input-suffix">ETH</span>
              </div>
            </label>
            <button type="button" className="gf-btn" onClick={handleContribute} disabled={loading}>
              {loading ? (
                <>
                  <Spinner tone="light" />
                  Sending…
                </>
              ) : (
                "Fund"
              )}
            </button>
          </div>
        </div>
      )}

      {st === 2 && milestoneSnap && (
        <div className="gf-vote-meta">
          <p>
            Payout <strong>{milestoneSnap.payoutRatio}%</strong> · Round <strong>{voteRound}</strong>
          </p>
          <p>
            For <strong>{milestoneSnap.yesVotes}</strong> ETH · Against <strong>{milestoneSnap.noVotes}</strong> ETH
          </p>
          <p>
            Closes {formatDateTime(milestoneSnap.votingDeadline)} · <strong>{formatDuration(voteRemain)}</strong> left
          </p>
          {hasVotedFlag && <p style={{ color: "#b45309", marginBottom: 0 }}>You already voted this round.</p>}
        </div>
      )}

      {st === 2 && (
        <div className="gf-btn-row">
          <button
            type="button"
            className="gf-btn"
            disabled={!canVote || hasVotedFlag || voteKind !== null}
            onClick={() => handleVote(true)}
          >
            {voteKind === "for" ? (
              <>
                <Spinner tone="light" />
                Sending…
              </>
            ) : (
              "Vote for"
            )}
          </button>
          <button
            type="button"
            className="gf-btn gf-btn--outline"
            disabled={!canVote || hasVotedFlag || voteKind !== null}
            onClick={() => handleVote(false)}
          >
            {voteKind === "against" ? (
              <>
                <Spinner tone="dark" />
                Sending…
              </>
            ) : (
              "Vote against"
            )}
          </button>
        </div>
      )}

      {st === 3 && <p className="gf-panel__hint">Grace period — wait for the creator to resubmit before voting again.</p>}

      {st === 4 && (
        <div>
          {refundable != null && (
            <p className="gf-panel__hint">
              Refundable ≈ <strong>{refundable} ETH</strong>
              {parseFloat(refundable) <= 0 && " (already claimed or none)"}
            </p>
          )}
          <button
            type="button"
            className="gf-btn"
            disabled={refundable == null || parseFloat(refundable) <= 0 || loading}
            onClick={() => executeAction(() => contract.claimRefund(), "Refund claimed.")}
          >
            {loading ? (
              <>
                <Spinner tone="light" />
                Sending…
              </>
            ) : (
              "Claim refund"
            )}
          </button>
        </div>
      )}

      {st === 5 && <p className="gf-done-msg">Campaign completed. Thank you.</p>}
    </div>
  );
};

export default BackerPanel;
