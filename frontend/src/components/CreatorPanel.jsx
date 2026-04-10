import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { secondsRemaining, formatDuration, formatDateTime } from "../utils/time";
import { CONTRACT_ADDRESS } from "../utils/constants";
import { Spinner } from "./Spinner";

/** Used by Quick start only; change voting length via Custom parameters. */
const QUICK_START_VOTING_SECONDS = 60;

function shortCreatorAddr(a) {
  if (!a || a.length < 12) return a || "";
  const lower = a.toLowerCase();
  return `0x${lower.slice(2, 6)}…${lower.slice(-4)}`;
}

function InfoCallout({ children }) {
  return (
    <div className="gf-callout" role="note">
      <svg className="gf-callout__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
        <path d="M12 10v5M12 7v.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <p>{children}</p>
    </div>
  );
}

function InputWithSuffix({ label, suffix, value, onChange, placeholder, className = "" }) {
  return (
    <label className={`gf-form-label ${className}`.trim()}>
      {label}
      <div className="gf-input-wrap">
        <input className="gf-input gf-input--mono" value={value} onChange={onChange} placeholder={placeholder} />
        <span className="gf-input-suffix">{suffix}</span>
      </div>
    </label>
  );
}

const CreatorPanel = ({ contract, info, account, refresh }) => {
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [fundingGoalEth, setFundingGoalEth] = useState("10");
  const [fundMinutes, setFundMinutes] = useState("3");
  const [ratiosText, setRatiosText] = useState("40,60");
  const [votingThreshold, setVotingThreshold] = useState("50");
  const [quorum, setQuorum] = useState("20");
  const [minContribEth, setMinContribEth] = useState("1");
  const [graceMinutes, setGraceMinutes] = useState("3");
  const [votingSeconds, setVotingSeconds] = useState("20");

  useEffect(() => {
    if (!contract) return undefined;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [contract]);

  if (!contract) {
    return (
      <div className="gf-panel gf-panel--creator">
        <h3 className="gf-panel__title">Creator</h3>
        <p className="gf-panel__hint">
          No bytecode at{" "}
          <span className="gf-mono" title={CONTRACT_ADDRESS}>
            {CONTRACT_ADDRESS}
          </span>
          . Start <code className="gf-mono">npx hardhat node</code>, run{" "}
          <code className="gf-mono">npx hardhat run scripts/deploy.js --network localhost</code>, copy the printed address into{" "}
          <code className="gf-mono">frontend/src/utils/constants.js</code>, add MetaMask Localhost 8545 (chain 31337), then refresh this page.
        </p>
      </div>
    );
  }

  const runCreate = async (params) => {
    const tx = await contract.createCampaign(
      params.fundingGoal,
      params.deadline,
      params.payoutRatios,
      params.votingThreshold,
      params.quorum,
      params.minContribution,
      params.gracePeriod,
      params.votingPeriod
    );
    await tx.wait();
  };

  const handleCreateQuick = async () => {
    try {
      setLoading(true);
      const fundingGoal = ethers.parseEther("10");
      const deadline = Math.floor(Date.now() / 1000) + 3 * 60;
      await runCreate({
        fundingGoal,
        deadline,
        payoutRatios: [40, 60],
        votingThreshold: 50,
        quorum: 20,
        minContribution: ethers.parseEther("1"),
        gracePeriod: 3 * 60,
        votingPeriod: QUICK_START_VOTING_SECONDS,
      });
      alert(`Campaign created (3-minute funding · voting 1 min per milestone).`);
      await refresh();
    } catch (error) {
      console.error(error);
      alert("Create failed — check the console.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromForm = async () => {
    const parts = ratiosText.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
    if (parts.length === 0) {
      alert("Enter milestone ratios, e.g. 40,60");
      return;
    }
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      alert(`Ratios must sum to 100 (currently ${sum}).`);
      return;
    }
    const vt = parseInt(votingThreshold, 10);
    const q = parseInt(quorum, 10);
    if (vt <= 0 || vt > 100 || q <= 0 || q > 100) {
      alert("Threshold and quorum must be between 1 and 100.");
      return;
    }
    const fm = parseInt(fundMinutes, 10);
    const gm = parseInt(graceMinutes, 10);
    const vs = parseInt(votingSeconds, 10);
    if (fm <= 0 || gm <= 0) {
      alert("Funding length and grace period must be positive (minutes).");
      return;
    }
    if (!Number.isFinite(vs) || vs <= 0) {
      alert("Voting period must be a positive integer (seconds).");
      return;
    }

    try {
      setLoading(true);
      await runCreate({
        fundingGoal: ethers.parseEther(fundingGoalEth || "0"),
        deadline: Math.floor(Date.now() / 1000) + fm * 60,
        payoutRatios: parts,
        votingThreshold: vt,
        quorum: q,
        minContribution: ethers.parseEther(minContribEth || "0"),
        gracePeriod: gm * 60,
        votingPeriod: vs,
      });
      alert("Campaign created.");
      await refresh();
    } catch (error) {
      console.error(error);
      alert("Create failed — check the console.");
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
      alert("Transaction failed — timing or conditions may not be met.");
    } finally {
      setLoading(false);
    }
  };

  const st = info ? Number(info.status) : -1;
  const fundLeft = st === 0 ? secondsRemaining(info.deadline) : 0;
  const isCreatorWallet = info && account && account.toLowerCase() === info.creator.toLowerCase();

  if (!info) {
    return (
      <div className="gf-panel gf-panel--creator">
        <h3 className="gf-panel__title">Creator</h3>
        <p className="gf-panel__hint">Deploy a campaign on-chain to start milestone funding and voting.</p>
        <div className="gf-btn-row">
          <button type="button" className="gf-btn" onClick={handleCreateQuick} disabled={loading}>
            {loading ? (
              <>
                <Spinner tone="light" />
                Sending…
              </>
            ) : (
              "Quick start (10 ETH · 3 min · 1 min vote · 40/60)"
            )}
          </button>
          {!showForm ? (
            <button type="button" className="gf-btn gf-btn--outline" onClick={() => setShowForm(true)} disabled={loading}>
              Custom parameters
            </button>
          ) : (
            <button type="button" className="gf-btn gf-btn--ghost" onClick={() => setShowForm(false)} disabled={loading}>
              Hide form
            </button>
          )}
        </div>
        {showForm && (
          <div className="gf-form">
            <InfoCallout>
              Milestone payout ratios must sum to exactly <strong>100</strong>. Funding ends after the funding duration; each milestone vote stays open for the voting period (seconds) you set below, including after grace resubmits.
            </InfoCallout>
            <div className="gf-form-grid">
              <InputWithSuffix
                label="Goal"
                suffix="ETH"
                value={fundingGoalEth}
                onChange={(e) => setFundingGoalEth(e.target.value)}
              />
              <InputWithSuffix
                label="Funding"
                suffix="MIN"
                value={fundMinutes}
                onChange={(e) => setFundMinutes(e.target.value)}
              />
              <label className="gf-form-label gf-span-2">
                Milestone ratios
                <div className="gf-input-wrap">
                  <input
                    className="gf-input gf-input--mono"
                    value={ratiosText}
                    onChange={(e) => setRatiosText(e.target.value)}
                    placeholder="40,60"
                    spellCheck={false}
                  />
                </div>
              </label>
              <InputWithSuffix
                label="Approval threshold"
                suffix="%"
                value={votingThreshold}
                onChange={(e) => setVotingThreshold(e.target.value)}
              />
              <InputWithSuffix label="Quorum" suffix="%" value={quorum} onChange={(e) => setQuorum(e.target.value)} />
              <InputWithSuffix
                label="Min. stake to vote"
                suffix="ETH"
                value={minContribEth}
                onChange={(e) => setMinContribEth(e.target.value)}
              />
              <InputWithSuffix
                label="Grace period"
                suffix="MIN"
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(e.target.value)}
              />
              <InputWithSuffix
                label="Voting period"
                suffix="SEC"
                value={votingSeconds}
                onChange={(e) => setVotingSeconds(e.target.value)}
              />
            </div>
            <button type="button" className="gf-btn" style={{ marginTop: "16px" }} onClick={handleCreateFromForm} disabled={loading}>
              {loading ? (
                <>
                  <Spinner tone="light" />
                  Sending…
                </>
              ) : (
                "Deploy campaign"
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="gf-panel gf-panel--creator">
      <h3 className="gf-panel__title">Creator actions</h3>
      <p className="gf-panel__hint">
        Finalize funding, submit milestones, finalize votes, or resubmit during grace (creator-only steps are enforced on-chain).
      </p>
      {st === 1 && !isCreatorWallet && (
        <div className="gf-callout" style={{ marginBottom: 14 }} role="status">
          <p style={{ margin: 0 }}>
            This phase needs the <strong>creator</strong> wallet. You are on <span className="gf-mono">{shortCreatorAddr(account)}</span> but the creator is{" "}
            <span className="gf-mono" title={info.creator}>
              {shortCreatorAddr(info.creator)}
            </span>
            . Switch accounts in MetaMask to submit <strong>milestone {info.currentMilestone + 1}</strong> of {info.milestoneCount} after a vote payout.
          </p>
        </div>
      )}
      {st === 1 && isCreatorWallet && info.currentMilestone < info.milestoneCount && (
        <p className="gf-panel__hint" style={{ marginTop: 0 }}>
          {parseFloat(info.releasedAmount) === 0
            ? `Funding succeeded — submit milestone ${info.currentMilestone + 1} of ${info.milestoneCount} to open voting.`
            : `Last vote approved and payout sent — submit milestone ${info.currentMilestone + 1} of ${info.milestoneCount} for the next round.`}
        </p>
      )}
      <div className="gf-btn-row">
        {st === 0 && (
          <button type="button" className="gf-btn" disabled={loading} onClick={() => executeAction(() => contract.finalizeFunding(), "Funding finalized.")}>
            {loading ? (
              <>
                <Spinner tone="light" />
                Sending…
              </>
            ) : (
              <>
                Finalize funding
                {fundLeft > 0 ? ` · in ${formatDuration(fundLeft)}` : ""}
              </>
            )}
          </button>
        )}

        {st === 1 && isCreatorWallet && info.currentMilestone < info.milestoneCount && (
          <button type="button" className="gf-btn" disabled={loading} onClick={() => executeAction(() => contract.submitMilestone(), "Milestone submitted — voting open.")}>
            {loading ? (
              <>
                <Spinner tone="light" />
                Sending…
              </>
            ) : (
              `Submit milestone ${info.currentMilestone + 1}`
            )}
          </button>
        )}

        {st === 2 && <VoteFinalizeHint contract={contract} info={info} executeAction={executeAction} loading={loading} now={now} />}

        {st === 3 && isCreatorWallet && (
          <GraceResubmitHint contract={contract} info={info} executeAction={executeAction} loading={loading} now={now} />
        )}
      </div>
      {st === 4 && <p className="gf-panel__hint">Campaign failed on-chain. Refunds are handled from the Backer panel.</p>}
      {st === 5 && (
        <p className="gf-panel__hint">
          Campaign <strong>completed</strong>
          {info.milestoneCount <= 1 ? " (single milestone)." : ` — all ${info.milestoneCount} milestone(s) resolved.`}
        </p>
      )}
    </div>
  );
};

function VoteFinalizeHint({ contract, info, executeAction, loading, now }) {
  const [deadline, setDeadline] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await contract.getMilestoneInfo(info.currentMilestone);
        if (!cancelled) setDeadline(Number(m.votingDeadline));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contract, info.currentMilestone, info.status]);

  const left = deadline > 0 ? Math.max(0, Math.floor(deadline - now / 1000)) : 0;
  return (
    <button type="button" className="gf-btn" disabled={loading} onClick={() => executeAction(() => contract.finalizeVote(), "Vote finalized.")}>
      {loading ? (
        <>
          <Spinner tone="light" />
          Sending…
        </>
      ) : (
        <>
          Finalize vote
          {deadline > 0 ? ` · ends ${formatDateTime(deadline)} · ${formatDuration(left)} left` : ""}
        </>
      )}
    </button>
  );
}

function GraceResubmitHint({ contract, info, executeAction, loading, now }) {
  const [graceDl, setGraceDl] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await contract.getMilestoneInfo(info.currentMilestone);
        if (!cancelled) setGraceDl(Number(m.graceDeadline));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contract, info.currentMilestone, info.status]);

  const left = graceDl > 0 ? Math.max(0, Math.floor(graceDl - now / 1000)) : 0;
  return (
    <button type="button" className="gf-btn" disabled={loading} onClick={() => executeAction(() => contract.resubmitMilestone(), "Resubmitted.")}>
      {loading ? (
        <>
          <Spinner tone="light" />
          Sending…
        </>
      ) : (
        <>
          Resubmit during grace
          {graceDl > 0 ? ` · ${formatDuration(left)} left` : ""}
        </>
      )}
    </button>
  );
}

export default CreatorPanel;
