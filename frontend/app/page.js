"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  FACTORY_ADDRESS,
  STATUS,
  campaignContract,
  factoryContract,
  formatUsdc,
  friendlyError,
  parseUsdc,
  shortAddress,
} from "../lib/contracts";
import { useWallet } from "../components/WalletProvider";

const defaultMilestones = [
  { share: "30", dueDate: "" },
  { share: "30", dueDate: "" },
  { share: "40", dueDate: "" },
];

export default function Home() {
  const { provider, signer, account, connect } = useWallet();
  const [campaigns, setCampaigns] = useState([]);
  const [goal, setGoal] = useState("3000");
  const [deadline, setDeadline] = useState("");
  const [milestones, setMilestones] = useState(defaultMilestones);
  const [message, setMessage] = useState("");

  const loadCampaigns = useCallback(async () => {
    if (!provider || !FACTORY_ADDRESS) return;
    try {
      const factory = factoryContract(provider);
      const count = Number(await factory.campaignCount());
      const addresses = await Promise.all(Array.from({ length: count }, (_, index) => factory.campaignAt(index)));
      const records = await Promise.all(addresses.map(async (address) => {
        const campaign = campaignContract(address, provider);
        const [campaignGoal, raised, status] = await Promise.all([
          campaign.goal(),
          campaign.totalRaised(),
          campaign.status(),
        ]);
        return { address, goal: campaignGoal, raised, status: Number(status) };
      }));
      setCampaigns(records.reverse());
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }, [provider]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  function updateMilestone(index, key, value) {
    setMilestones((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }

  async function createCampaign(event) {
    event.preventDefault();
    if (!signer) {
      await connect();
      setMessage("Wallet connected. Submit the form again.");
      return;
    }
    try {
      const deadlineSeconds = Math.floor(new Date(deadline).getTime() / 1000);
      const inputs = milestones.map((row) => [
        Math.round(Number(row.share) * 100),
        Math.floor(new Date(row.dueDate).getTime() / 1000),
      ]);
      const shareTotal = inputs.reduce((sum, row) => sum + row[0], 0);
      if (shareTotal !== 10000) throw new Error("Milestone shares must total 100%");
      if (!deadlineSeconds || inputs.some((row) => !row[1])) throw new Error("Choose every date");
      setMessage("Create transaction pending...");
      const tx = await factoryContract(signer).createCampaign(parseUsdc(goal), deadlineSeconds, inputs);
      await tx.wait();
      setMessage("Campaign created");
      await loadCampaigns();
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Crowdfunding with accountable releases</p>
        <h1>Fund the plan.<br />Release on proof.</h1>
        <p className="lede">Backer votes unlock each creator milestone. If delivery stops, the remaining escrow returns to contributors.</p>
      </section>

      {!FACTORY_ADDRESS && (
        <div className="notice">Run the local deploy script to create <code>frontend/.env.local</code>, then restart this app.</div>
      )}

      <section className="section-heading">
        <div>
          <p className="eyebrow">On-chain registry</p>
          <h2>Campaigns</h2>
        </div>
        <button className="secondary" onClick={loadCampaigns}>Refresh</button>
      </section>

      <div className="campaign-grid">
        {campaigns.map((campaign) => {
          const progress = campaign.goal > 0n ? Math.min(100, Number(campaign.raised * 10000n / campaign.goal) / 100) : 0;
          return (
            <Link className="campaign-card" href={`/campaign/${campaign.address}`} key={campaign.address}>
              <div className="card-top">
                <span className={`status status-${campaign.status}`}>{STATUS[campaign.status]}</span>
                <span className="mono">{shortAddress(campaign.address)}</span>
              </div>
              <h3>{formatUsdc(campaign.raised)} <small>/ {formatUsdc(campaign.goal)} mUSDC</small></h3>
              <div className="progress"><span style={{ width: `${progress}%` }} /></div>
              <p>{progress.toFixed(1)}% funded</p>
            </Link>
          );
        })}
        {!campaigns.length && <div className="empty">No campaigns yet. Create the first one below.</div>}
      </div>

      <section className="form-card">
        <div className="form-intro">
          <p className="eyebrow">Creator setup</p>
          <h2>Create a campaign</h2>
          <p>Shares must total 100%. Due dates must be after the funding deadline and strictly increase.</p>
        </div>
        <form onSubmit={createCampaign}>
          <div className="two-columns">
            <label>Goal in mUSDC<input required min="0.000001" step="0.000001" value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
            <label>Funding deadline<input required type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
          </div>
          <div className="milestone-form">
            {milestones.map((row, index) => (
              <div className="milestone-row" key={index}>
                <strong>Milestone {index + 1}</strong>
                <label>Share %<input required type="number" min="0.01" max="100" step="0.01" value={row.share} onChange={(event) => updateMilestone(index, "share", event.target.value)} /></label>
                <label>Due date<input required type="datetime-local" value={row.dueDate} onChange={(event) => updateMilestone(index, "dueDate", event.target.value)} /></label>
                {milestones.length > 1 && <button type="button" className="text-button" onClick={() => setMilestones((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>}
              </div>
            ))}
          </div>
          <div className="form-footer">
            <button type="button" className="secondary" onClick={() => setMilestones((rows) => [...rows, { share: "", dueDate: "" }])}>Add milestone</button>
            <button type="submit" disabled={!account}>Create campaign</button>
          </div>
          {message && <p className="transaction-message">{message}</p>}
        </form>
      </section>
    </>
  );
}
