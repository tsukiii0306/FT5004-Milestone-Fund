import { useState } from "react";
import { ethers } from "ethers";
import { FACTORY_ADDRESS, factoryABI, DEFAULT_GOVERNANCE, MILESTONE_COUNT, DEFAULT_PAYOUT_RATIOS } from "../utils/constants";
import { useNavigate } from "react-router-dom";

export default function Create() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: "My Web3 Gaming Project",
    description: "Developing a blockchain-based card game with comprehensive tokenomics.",
    fundingGoal: "10",
    payoutRatios: DEFAULT_PAYOUT_RATIOS,
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!window.ethereum) return alert("Please install MetaMask!");

    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryABI, signer);

      const goalInWei = ethers.parseEther(formData.fundingGoal);
      const minContributionWei = ethers.parseEther(DEFAULT_GOVERNANCE.minContributionEth);

      const ratiosArray = formData.payoutRatios.split(",").map((s) => Number(s.trim()));
      if (ratiosArray.length !== MILESTONE_COUNT) {
        throw new Error(`Enter exactly ${MILESTONE_COUNT} percentages (one per milestone), separated by commas.`);
      }
      if (ratiosArray.some((r) => !Number.isFinite(r) || !Number.isInteger(r) || r <= 0)) {
        throw new Error("Each payout must be a positive whole number (on-chain ratios are integers).");
      }
      const sumRatios = ratiosArray.reduce((a, b) => a + b, 0);
      if (sumRatios !== 100) throw new Error("Milestone payout ratios must sum to 100%.");

      const tx = await factoryContract.createCampaign(
        formData.title,
        formData.description,
        goalInWei,
        ratiosArray,
        DEFAULT_GOVERNANCE.votingThreshold,
        DEFAULT_GOVERNANCE.quorum,
        minContributionWei
      );

      await tx.wait();
      alert("Campaign created successfully.");
      navigate("/");
    } catch (error) {
      console.error("Creation failed:", error);
      alert("Failed to create campaign: " + (error.reason || error.message));
    }
    setLoading(false);
  };

  return (
    <div className="mf-card-page mf-card-page--wide">
      <p className="mf-page-eyebrow">Factory deployment</p>
      <h1 className="mf-create-title">New campaign</h1>
      <p className="mf-muted" style={{ textAlign: "center", marginTop: "-1rem", marginBottom: "2rem" }}>
        Set funding and milestones.
      </p>

      <form onSubmit={handleCreate} className="mf-form">
        <section className="mf-form-section">
          <h4>Basics</h4>
          <label className="mf-label" htmlFor="create-title">
            Title
          </label>
          <input id="create-title" type="text" name="title" value={formData.title} onChange={handleChange} required className="mf-input" />

          <label className="mf-label mf-field-gap" htmlFor="create-desc">
            Description
          </label>
          <textarea
            id="create-desc"
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
            className="mf-textarea"
            rows={4}
            style={{ resize: "vertical", minHeight: "100px" }}
          />
        </section>

        <section className="mf-form-section">
          <h4>Funding</h4>
          <div className="mf-row">
            <div>
              <label className="mf-label" htmlFor="create-goal">
                Goal (ETH)
              </label>
              <input id="create-goal" type="number" step="0.01" name="fundingGoal" value={formData.fundingGoal} onChange={handleChange} required className="mf-input" />
            </div>
            <div>
              <label className="mf-label" htmlFor="create-ratios">
                Payout ratios ({MILESTONE_COUNT} milestones, %)
              </label>
              <input
                id="create-ratios"
                type="text"
                name="payoutRatios"
                value={formData.payoutRatios}
                onChange={handleChange}
                placeholder="e.g. 40,60"
                className="mf-input"
                required
              />
            </div>
          </div>
        </section>

        <button type="submit" disabled={loading} className="mf-btn mf-btn--primary mf-btn--block">
          {loading ? "Confirming…" : "Deploy campaign"}
        </button>
      </form>
    </div>
  );
}
