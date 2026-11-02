# MilestoneVault

Decentralized crowdfunding with milestone-based escrow, built on Ethereum (Sepolia testnet).

Project Group 7, Arizona State University, Blockchain course, Fall 2026.
Team: Harshith Dharbi, Kamalesh Reddi Arugunta, Pratham Hegde, Sachin Kothandaraman, Sivasankar Annapureddy.

> **Status: draft.** This repository holds the contract interfaces, a first draft of the escrow logic, and the project setup. The test suite, deployment to Sepolia, and the frontend are still in progress.

## Description

Reward-based crowdfunding platforms such as Kickstarter pay the creator the whole pool of backer money as soon as a campaign succeeds. After that, backers have no leverage if the creator stalls or disappears.

MilestoneVault locks contributions in a smart-contract escrow and releases them in tranches. Each tranche is paid only after backers vote that a promised milestone was delivered. If the funding goal is missed, a milestone is rejected twice, or a due date passes, backers withdraw their remaining share from the contract.

Blockchain fits because funds sit in code instead of a company's bank account, the release and refund rules are public and cannot change after deployment, and every payment and vote is auditable. The contract cannot check whether a prototype was really built, so backers act as the oracle: the creator posts evidence on IPFS and contribution-weighted votes decide each release.

## How it works

1. A creator calls `CampaignFactory.createCampaign` with a goal, a funding deadline, and a list of milestones (each with a percentage share and a due date).
2. Backers call `contribute` with mUSDC until the funding deadline.
3. After the deadline anyone calls `finalizeFunding`. If the goal was met the campaign becomes Active. If not, it is Cancelled and backers can `claimRefund`.
4. Before the milestone's due date, the creator calls `submitMilestone` with an IPFS CID of the evidence. A 3-day voting window opens.
5. Backers call `vote`. Vote weight equals the amount the backer contributed.
6. After the window anyone calls `finalizeVote`. With at least 20% of the raised funds voting and a majority of yes weight, that milestone's tranche is paid to the creator.
7. A rejected milestone can be resubmitted once, as long as its due date has not passed. A second rejection, or a missed due date (`cancelIfOverdue`, or a rejection that lands after the due date), cancels the campaign. Backers then call `claimRefund` for their pro-rata share of what has not been paid out.

## Repository layout

```
milestonevault/
  contracts/
    interfaces/
      ICampaign.sol          Campaign interface: types, events, function signatures
      ICampaignFactory.sol   Factory interface
    Campaign.sol             Escrow for one project (draft logic)
    CampaignFactory.sol      Deploys one Campaign per project, keeps a registry
    mocks/
      MockUSDC.sol           Test stablecoin with a faucet (6 decimals)
  scripts/
    deploy.js                Deploys MockUSDC and CampaignFactory
  test/                      Hardhat tests (to be written)
  frontend/                  React/Next.js dApp (to be built)
  hardhat.config.js
  package.json
  .env.example
```

## Contract design

| Contract | Role |
| --- | --- |
| `CampaignFactory` | Deploys an isolated `Campaign` for each project so one exploit cannot drain every campaign. Stores the list of campaigns for the UI. |
| `Campaign` | Holds the escrowed tokens and runs the funding, voting, payout, and refund logic. |
| `MockUSDC` | Test stablecoin. Anyone can call `faucet()` for 1,000 mUSDC. |

Security choices carried over from the proposal:

- Refunds are pull-based. Backers withdraw, and the contract never loops over backers or pushes funds to them.
- State is updated before every token transfer (checks-effects-interactions).
- OpenZeppelin `ReentrancyGuard` and `SafeERC20` are used on every function that moves tokens.
- Only small values are stored on-chain. Descriptions, images, and milestone proof live on IPFS and only the CID is stored.

### Main parameters

| Parameter | Value |
| --- | --- |
| Voting window | 3 days |
| Quorum | 20% of total raised |
| Passing rule | Yes weight greater than no weight |
| Resubmissions per milestone | 1 |
| Milestone shares | Must add up to 10000 basis points (100%) |
| Milestone due dates | Strictly increasing, all after the funding deadline |

### Interface summary

Full signatures, types, and events are in `contracts/interfaces/`.

| Function | Who | When |
| --- | --- | --- |
| `CampaignFactory.createCampaign(goal, fundingDeadline, milestones)` | Anyone (becomes creator) | Any time |
| `Campaign.contribute(amount)` | Backer | Funding, before the deadline |
| `Campaign.finalizeFunding()` | Anyone | After the funding deadline |
| `Campaign.submitMilestone(evidenceCid)` | Creator | Active, before the milestone due date |
| `Campaign.vote(approve)` | Backer | During the 3-day window, once per round |
| `Campaign.finalizeVote()` | Anyone | After the voting window |
| `Campaign.cancelIfOverdue()` | Anyone | Active, due date passed, no vote open |
| `Campaign.claimRefund()` | Backer | Cancelled, once |

Read-only views include `status`, `totalRaised`, `totalReleased`, `currentMilestone`, `getMilestone`, `contributionOf`, `hasVoted`, `votingEnds`, `yesWeight`, and `noWeight`. Events (`Contributed`, `Voted`, `MilestoneApproved`, `Refunded`, and others) feed the planned dashboard.

## Dependencies

- Node.js 18 or newer and npm
- Solidity 0.8.20 (installed by Hardhat)
- Hardhat 2.22+ and `@nomicfoundation/hardhat-toolbox` 5.x (includes ethers v6)
- OpenZeppelin Contracts 5.x (`ReentrancyGuard`, `SafeERC20`, `ERC20`)
- `dotenv` for reading `.env`
- MetaMask (browser wallet) for using the dApp
- Sepolia test ETH and an RPC URL (Alchemy or Infura) for deployment
- Pinata account for IPFS uploads (frontend, not needed for the contracts)

## Setup

```bash
git clone <this repository>
cd milestonevault
npm install
cp .env.example .env     # then fill in the values
npx hardhat compile
```

## Test

```bash
npx hardhat test
```

The test suite is not written yet. The target is at least 90% line coverage, including refund and attack cases.

## Deploy

Local network:

```bash
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

Sepolia (needs `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` in `.env`):

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

The script prints the MockUSDC and CampaignFactory addresses. The frontend reads them from its environment file.

## Using the app (planned)

1. Connect MetaMask on Sepolia.
2. Call the MockUSDC faucet to get test tokens.
3. Create a campaign, or contribute to an existing one.
4. Approve the campaign to spend your mUSDC, then contribute.
5. When a milestone is submitted, open the campaign page and vote.
6. Use the dashboard to follow funding, votes, and payouts. It reads everything from contract events.

## Scope

Committed for the MVP: factory and escrow contracts, contribution-weighted voting, refunds and timeouts, a Hardhat test suite, a working dApp, Sepolia deployment, and a live demo.

Stretch goals if time allows: creator reputation scores, quadratic voting, and an L2 deployment.

## Known gaps in this draft

- No tests yet.
- No frontend yet.
- Backers cannot change their vote or withdraw during voting.
- Static analysis (Slither) has not been run.
- The contracts are a course project and have not been audited. Do not use them with real funds.

## References

- Mollick, E. "Delivery Rates on Kickstarter." Wharton School, 2015.
- Buterin, V. "Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform." 2014.
- Atzei, N., Bartoletti, M., Cimoli, T. "A survey of attacks on Ethereum smart contracts (SoK)." POST 2017.
- OpenZeppelin Contracts documentation, docs.openzeppelin.com/contracts.
- Benet, J. "IPFS: Content Addressed, Versioned, P2P File System." 2014.
