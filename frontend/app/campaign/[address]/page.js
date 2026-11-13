"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import DevPanel from "../../../components/DevPanel";
import { useWallet } from "../../../components/WalletProvider";
import {
  MILESTONE_STATUS,
  STATUS,
  campaignContract,
  formatUsdc,
  friendlyError,
  parseUsdc,
  shortAddress,
  usdcContract,
} from "../../../lib/contracts";

function formatDate(value) {
  return new Date(Number(value) * 1000).toLocaleString();
}

function countdown(target, now) {
  const seconds = Math.max(0, Number(target) - now);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return seconds ? `${days}d ${hours}h ${minutes}m` : "Closed";
}

export default function CampaignPage() {
  const { address } = useParams();
  const { provider, signer, account, refreshBalance } = useWallet();
  const [data, setData] = useState(null);
  const [activities, setActivities] = useState([]);
  const [contribution, setContribution] = useState("100");
  const [cid, setCid] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const load = useCallback(async () => {
    if (!provider || !address) return;
    try {
      const campaign = campaignContract(address, provider);
      const [
        creator,
        status,
        goal,
        raised,
        released,
        fundingDeadline,
        currentMilestone,
        milestoneCount,
        votingEnds,
        yesWeight,
        noWeight,
      ] = await Promise.all([
        campaign.creator(),
        campaign.status(),
        campaign.goal(),
        campaign.totalRaised(),
        campaign.totalReleased(),
        campaign.fundingDeadline(),
        campaign.currentMilestone(),
        campaign.milestoneCount(),
        campaign.votingEnds(),
        campaign.yesWeight(),
        campaign.noWeight(),
      ]);
      const milestones = await Promise.all(
        Array.from({ length: Number(milestoneCount) }, (_, index) => campaign.getMilestone(index)),
      );
      const userContribution = account ? await campaign.contributionOf(account) : 0n;
      const userVoted = account ? await campaign.hasVoted(account) : false;
      const block = await provider.getBlock("latest");
      setNow(block.timestamp);
      setData({
        creator,
        status: Number(status),
        goal,
        raised,
        released,
        fundingDeadline,
        currentMilestone: Number(currentMilestone),
        votingEnds,
        yesWeight,
        noWeight,
        milestones,
        userContribution,
        userVoted,
      });

      const eventNames = [
        "Contributed",
        "FundingFinalized",
        "MilestoneSubmitted",
        "Voted",
        "MilestoneApproved",
        "MilestoneRejected",
        "CampaignCancelled",
        "CampaignCompleted",
        "Refunded",
      ];
      const groups = await Promise.all(eventNames.map(async (name) => {
        const events = await campaign.queryFilter(campaign.filters[name](), 0, "latest");
        return events.map((event) => ({ name, event }));
      }));
      const feed = groups.flat().sort((a, b) => {
        if (a.event.blockNumber !== b.event.blockNumber) return b.event.blockNumber - a.event.blockNumber;
        return Number(b.event.index) - Number(a.event.index);
      });
      setActivities(feed);
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }, [provider, address, account]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  async function transact(label, operation) {
    if (!signer) {
      setMessage("Connect MetaMask first");
      return;
    }
    try {
      setBusy(true);
      setMessage(`${label} pending in MetaMask...`);
      const tx = await operation();
      setMessage(`${label} submitted. Waiting for confirmation...`);
      await tx.wait();
      setMessage(`${label} confirmed`);
      await refreshBalance();
      await load();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function contribute(event) {
    event.preventDefault();
    if (!signer) return setMessage("Connect MetaMask first");
    try {
      setBusy(true);
      const value = parseUsdc(contribution);
      setMessage("Token approval pending in MetaMask...");
      const approval = await usdcContract(signer).approve(address, value);
      await approval.wait();
      setMessage("Contribution pending in MetaMask...");
      const tx = await campaignContract(address, signer).contribute(value);
      await tx.wait();
      setMessage("Contribution confirmed");
      await refreshBalance();
      await load();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  const current = data?.milestones[data.currentMilestone];
  const progress = useMemo(() => {
    if (!data || data.goal === 0n) return 0;
    return Math.min(100, Number(data.raised * 10000n / data.goal) / 100);
  }, [data]);

  function activityText(item) {
    const args = item.event.args;
    switch (item.name) {
      case "Contributed": return `${shortAddress(args.backer)} contributed ${formatUsdc(args.amount)} mUSDC`;
      case "FundingFinalized": return args.goalMet ? "Funding goal met. Campaign activated." : "Funding goal missed. Campaign cancelled.";
      case "MilestoneSubmitted": return `Milestone ${Number(args.index) + 1} submitted with CID ${args.evidenceCid}`;
      case "Voted": return `${shortAddress(args.backer)} voted ${args.approve ? "yes" : "no"} with ${formatUsdc(args.weight)} mUSDC`;
      case "MilestoneApproved": return `Milestone ${Number(args.index) + 1} approved. ${formatUsdc(args.amountReleased)} mUSDC released.`;
      case "MilestoneRejected": return `Milestone ${Number(args.index) + 1} rejected${args.canResubmit ? ". One resubmission remains." : "."}`;
      case "CampaignCancelled": return `Campaign cancelled: ${args.reason}`;
      case "CampaignCompleted": return "All milestones completed.";
      case "Refunded": return `${shortAddress(args.backer)} claimed ${formatUsdc(args.amount)} mUSDC`;
      default: return item.name;
    }
  }

  if (!data) {
    return <div className="loading">Loading campaign from the local chain...</div>;
  }

  const isCreator = account && account.toLowerCase() === data.creator.toLowerCase();
  const canSubmit = data.status === 1 && isCreator && current && [0, 3].includes(Number(current.status));
  const canVote = data.status === 1 && Number(current?.status) === 1 && data.userContribution > 0n && !data.userVoted && now < Number(data.votingEnds);
  const canFinalizeVote = data.status === 1 && Number(current?.status) === 1 && now >= Number(data.votingEnds);
  const canCancel = data.status === 1 && current && Number(current.status) !== 1 && now > Number(current.dueDate);
  const canFinalizeFunding = data.status === 0 && now >= Number(data.fundingDeadline);

  return (
    <>
      <Link href="/" className="back-link">← All campaigns</Link>
      <section className="campaign-hero">
        <div>
          <div className="title-line">
            <span className={`status status-${data.status}`}>{STATUS[data.status]}</span>
            <span className="mono">{address}</span>
          </div>
          <h1>{formatUsdc(data.raised)} <small>/ {formatUsdc(data.goal)} mUSDC</small></h1>
          <div className="progress large"><span style={{ width: `${progress}%` }} /></div>
          <p>{progress.toFixed(1)}% funded · {formatUsdc(data.released)} mUSDC released</p>
        </div>
        <dl className="facts">
          <div><dt>Creator</dt><dd>{shortAddress(data.creator)}</dd></div>
          <div><dt>Your contribution</dt><dd>{formatUsdc(data.userContribution)} mUSDC</dd></div>
          <div><dt>Funding closes</dt><dd>{formatDate(data.fundingDeadline)}</dd></div>
        </dl>
      </section>

      <div className="detail-grid">
        <div>
          <section className="card">
            <div className="section-heading compact">
              <div><p className="eyebrow">Delivery plan</p><h2>Milestones</h2></div>
            </div>
            <div className="milestone-list">
              {data.milestones.map((milestone, index) => (
                <article className={`milestone-item ${index === data.currentMilestone ? "current" : ""}`} key={index}>
                  <div className="milestone-number">{index + 1}</div>
                  <div>
                    <div className="milestone-title">
                      <h3>{Number(milestone.shareBps) / 100}% release</h3>
                      <span className="tag">{MILESTONE_STATUS[Number(milestone.status)]}</span>
                    </div>
                    <p>Due {formatDate(milestone.dueDate)} · Attempts {Number(milestone.attempts)} / 2</p>
                    {milestone.evidenceCid && <p className="cid">Evidence: {milestone.evidenceCid}</p>}
                    {index === data.currentMilestone && Number(milestone.status) === 1 && (
                      <div className="vote-meter">
                        <span>Yes {formatUsdc(data.yesWeight)}</span>
                        <span>No {formatUsdc(data.noWeight)}</span>
                        <strong>{countdown(data.votingEnds, now)}</strong>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card activity-card">
            <p className="eyebrow">Contract events</p>
            <h2>Activity</h2>
            <div className="activity-list">
              {activities.map((item) => (
                <div className="activity-item" key={`${item.event.transactionHash}-${item.event.index}`}>
                  <span className="activity-dot" />
                  <p>{activityText(item)}</p>
                </div>
              ))}
              {!activities.length && <p className="muted">No activity yet.</p>}
            </div>
          </section>
        </div>

        <aside>
          <section className="card action-card">
            <p className="eyebrow">Available now</p>
            <h2>Actions</h2>

            {data.status === 0 && now < Number(data.fundingDeadline) && (
              <form onSubmit={contribute}>
                <label>Contribution in mUSDC<input min="0.000001" step="0.000001" required value={contribution} onChange={(event) => setContribution(event.target.value)} /></label>
                <button disabled={busy} type="submit">Approve and contribute</button>
              </form>
            )}

            {canSubmit && (
              <form onSubmit={(event) => {
                event.preventDefault();
                transact("Milestone submission", () => campaignContract(address, signer).submitMilestone(cid));
              }}>
                <label>Evidence CID<input required placeholder="bafy..." value={cid} onChange={(event) => setCid(event.target.value)} /></label>
                <button disabled={busy} type="submit">{Number(current.status) === 3 ? "Resubmit milestone" : "Submit milestone"}</button>
              </form>
            )}

            {canVote && (
              <div>
                <p>Your vote weight is {formatUsdc(data.userContribution)} mUSDC.</p>
                <div className="button-row">
                  <button disabled={busy} onClick={() => transact("Yes vote", () => campaignContract(address, signer).vote(true))}>Vote yes</button>
                  <button disabled={busy} className="danger" onClick={() => transact("No vote", () => campaignContract(address, signer).vote(false))}>Vote no</button>
                </div>
              </div>
            )}

            {canFinalizeFunding && <button disabled={busy} onClick={() => transact("Funding finalization", () => campaignContract(address, signer).finalizeFunding())}>Finalize funding</button>}
            {canFinalizeVote && <button disabled={busy} onClick={() => transact("Vote finalization", () => campaignContract(address, signer).finalizeVote())}>Finalize vote</button>}
            {canCancel && <button disabled={busy} className="danger" onClick={() => transact("Overdue cancellation", () => campaignContract(address, signer).cancelIfOverdue())}>Cancel overdue campaign</button>}
            {data.status === 2 && data.userContribution > 0n && <button disabled={busy} onClick={() => transact("Refund claim", () => campaignContract(address, signer).claimRefund())}>Claim refund</button>}

            {!account && <p className="muted">Connect MetaMask to see your actions.</p>}
            {account && !canSubmit && !canVote && !canFinalizeFunding && !canFinalizeVote && !canCancel && !(data.status === 0 && now < Number(data.fundingDeadline)) && !(data.status === 2 && data.userContribution > 0n) && (
              <p className="muted">No action is available for this account right now.</p>
            )}
            {message && <p className="transaction-message">{message}</p>}
          </section>
        </aside>
      </div>

      <DevPanel fundingDeadline={data.fundingDeadline} onChanged={load} />
    </>
  );
}
