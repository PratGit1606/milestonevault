"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BrowserProvider, JsonRpcProvider } from "ethers";
import { USDC_ADDRESS, formatUsdc, usdcContract } from "../lib/contracts";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState("0");

  const refreshBalance = useCallback(async (activeProvider = provider, activeAccount = account) => {
    if (!activeProvider || !activeAccount || !USDC_ADDRESS) {
      setBalance("0");
      return;
    }
    setBalance(formatUsdc(await usdcContract(activeProvider).balanceOf(activeAccount)));
  }, [provider, account]);

  const configure = useCallback(async (requestAccounts) => {
    let nextProvider;
    if (window.ethereum) {
      nextProvider = new BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: requestAccounts ? "eth_requestAccounts" : "eth_accounts" });
      const network = await nextProvider.getNetwork();
      setProvider(nextProvider);
      setChainId(Number(network.chainId));
      if (accounts.length) {
        const nextSigner = await nextProvider.getSigner();
        setSigner(nextSigner);
        setAccount(accounts[0]);
        if (USDC_ADDRESS) {
          setBalance(formatUsdc(await usdcContract(nextProvider).balanceOf(accounts[0])));
        }
      } else {
        setSigner(null);
        setAccount("");
      }
      return;
    }
    nextProvider = new JsonRpcProvider("http://127.0.0.1:8545");
    setProvider(nextProvider);
    const network = await nextProvider.getNetwork();
    setChainId(Number(network.chainId));
  }, []);

  useEffect(() => {
    configure(false).catch(() => {});
    if (!window.ethereum) return;
    const reload = () => configure(false).catch(() => {});
    window.ethereum.on("accountsChanged", reload);
    window.ethereum.on("chainChanged", reload);
    return () => {
      window.ethereum.removeListener("accountsChanged", reload);
      window.ethereum.removeListener("chainChanged", reload);
    };
  }, [configure]);

  const value = useMemo(() => ({
    provider,
    signer,
    account,
    chainId,
    balance,
    connect: () => configure(true),
    refreshBalance,
  }), [provider, signer, account, chainId, balance, configure, refreshBalance]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  return useContext(WalletContext);
}
