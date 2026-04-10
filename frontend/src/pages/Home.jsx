import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  FACTORY_ADDRESS,
  factoryABI,
  milestoneFundABI,
  HIDE_ALL_FACTORY_CAMPAIGNS,
  HIDDEN_FACTORY_CAMPAIGN_INDICES,
} from "../utils/constants";
import { HARDHAT_JSON_RPC_URL } from "../utils/chain";
import { Link } from "react-router-dom";
import CopyableAddress from "../components/CopyableAddress";

export default function Home() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(HARDHAT_JSON_RPC_URL);
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryABI, provider);
      const deployedCampaigns = await factoryContract.getDeployedCampaigns();
      const hidden = new Set(HIDDEN_FACTORY_CAMPAIGN_INDICES);
      const visibleAddresses = HIDE_ALL_FACTORY_CAMPAIGNS
        ? []
        : deployedCampaigns.filter((_, i) => !hidden.has(i));

      const cards = await Promise.all(
        visibleAddresses.map(async (addr) => {
          try {
            const campaign = new ethers.Contract(addr, milestoneFundABI, provider);
            const info = await campaign.getCampaignInfo();
            const title = info.title ?? info[1];
            return { address: addr, title: title ? String(title) : "Untitled project" };
          } catch {
            return { address: addr, title: "Untitled project" };
          }
        })
      );
      setCampaigns(cards);
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="mf-page-head">
        <div>
          <p className="mf-page-eyebrow">On-chain registry</p>
          <h1 className="mf-page-title">Campaigns</h1>
          <p className="mf-page-lead">
            Projects deployed through the factory on your local network. Open a campaign to contribute, vote on milestones, or manage releases.
          </p>
        </div>
        <button type="button" onClick={fetchCampaigns} className="mf-btn mf-btn--secondary">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="mf-muted">Loading from the blockchain…</p>
      ) : campaigns.length === 0 ? (
        <div className="mf-empty">
          <p>No campaigns yet.</p>
          <Link to="/create" className="mf-btn mf-btn--primary">
            Create the first campaign
          </Link>
        </div>
      ) : (
        <div className="mf-grid">
          {campaigns.map(({ address, title }) => (
            <article key={address} className="mf-card">
              <h2 className="mf-card__title">{title}</h2>
              <CopyableAddress address={address} label="Contract" />
              <Link to={`/campaign/${address}`} className="mf-btn mf-btn--primary mf-btn--block" style={{ marginTop: "1rem" }}>
                View campaign
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
