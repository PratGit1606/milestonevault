"use client";

import Link from "next/link";
import { useState } from "react";
import { friendlyError, shortAddress, usdcContract } from "../lib/contracts";
import { useWallet } from "./WalletProvider";

export default function Header() {
  const { signer, account, balance, chainId, connect, refreshBalance } = useWallet();
  const [message, setMessage] = useState("");

  async function faucet() {
    try {
      setMessage("Faucet transaction pending...");
      const tx = await usdcContract(signer).faucet();
      await tx.wait();
      await refreshBalance();
      setMessage("Added 1,000 mUSDC");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  return (
    <header className="header">
      <Link href="/" className="brand">MilestoneVault</Link>
      <div className="wallet">
        {message && <span className="header-message">{message}</span>}
        {account ? (
          <>
            <span className="balance">{balance} mUSDC</span>
            {chainId === 31337 && <button className="secondary small" onClick={faucet}>Get test mUSDC</button>}
            <span className="address">{shortAddress(account)}</span>
          </>
        ) : (
          <button onClick={connect}>Connect wallet</button>
        )}
      </div>
    </header>
  );
}
