import { Contract, formatUnits, parseUnits } from "ethers";
import CampaignAbi from "../abi/Campaign.json";
import FactoryAbi from "../abi/CampaignFactory.json";
import UsdcAbi from "../abi/MockUSDC.json";

export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "";
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || "";
export const STATUS = ["Funding", "Active", "Cancelled", "Completed"];
export const MILESTONE_STATUS = ["Pending", "Voting", "Approved", "Rejected"];

export const formatUsdc = (value) => Number(formatUnits(value || 0n, 6)).toLocaleString(undefined, {
  maximumFractionDigits: 2,
});

export const parseUsdc = (value) => parseUnits(value, 6);
export const shortAddress = (value) => value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";

export function factoryContract(runner) {
  return new Contract(FACTORY_ADDRESS, FactoryAbi, runner);
}

export function campaignContract(address, runner) {
  return new Contract(address, CampaignAbi, runner);
}

export function usdcContract(runner) {
  return new Contract(USDC_ADDRESS, UsdcAbi, runner);
}

export function friendlyError(error) {
  const raw = error?.reason || error?.shortMessage || error?.info?.error?.message || error?.message || "Transaction failed";
  const match = raw.match(/Campaign: ([^"']+)/) || raw.match(/Factory: ([^"']+)/);
  if (match) return match[1].replace(/^./, (letter) => letter.toUpperCase());
  if (raw.includes("user rejected")) return "Transaction rejected in MetaMask";
  if (raw.includes("insufficient funds")) return "Not enough ETH for gas";
  return raw.replace("execution reverted: ", "").slice(0, 180);
}
