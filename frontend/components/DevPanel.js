"use client";

import { useState } from "react";
import { friendlyError } from "../lib/contracts";
import { useWallet } from "./WalletProvider";

export default function DevPanel({ fundingDeadline, onChanged }) {
  const { chainId, provider } = useWallet();
  const [message, setMessage] = useState("");
  if (chainId !== 31337) return null;

  async function mine(seconds) {
    try {
      setMessage("Advancing local time...");
      if (seconds > 0) await provider.send("evm_increaseTime", [seconds]);
      await provider.send("hardhat_mine", ["0x1"]);
      setMessage("Local time updated");
      await onChanged();
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  async function toFundingDeadline() {
    const block = await provider.getBlock("latest");
    await mine(Math.max(0, Number(fundingDeadline) - block.timestamp));
  }

  return (
    <section className="card dev-panel">
      <div>
        <p className="eyebrow">Local demo controls</p>
        <h2>Skip time</h2>
      </div>
      <div className="button-row">
        <button className="secondary" onClick={() => mine(86400)}>1 day</button>
        <button className="secondary" onClick={() => mine(3 * 86400)}>3 days</button>
        <button className="secondary" onClick={toFundingDeadline}>To funding deadline</button>
      </div>
      {message && <p className="muted">{message}</p>}
    </section>
  );
}
