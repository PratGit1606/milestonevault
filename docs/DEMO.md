# Five-Minute Demo Checklist

## Before recording

- Close any old local Hardhat node.
- Set MetaMask to Hardhat Local at `http://127.0.0.1:8545`, chain ID `31337`.
- Import one creator account and at least one backer account from the local node output.
- Keep the terminal, MetaMask, and browser visible and readable.

## Terminal order

Terminal 1:

```bash
cd milestonevault
npm install
npx hardhat compile
npm run abi
npm run node
```

Terminal 2:

```bash
cd milestonevault
npm run deploy:local
```

Confirm that both addresses print and `frontend/.env.local` is written.

Terminal 3:

```bash
cd milestonevault/frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Recording clicks

1. Connect the creator wallet. Click **Get test mUSDC**. Point out the 1,000 mUSDC header balance.
2. Create a 3,000 mUSDC campaign with a near funding deadline and milestone shares of 30%, 30%, and 40%. Keep due dates increasing.
3. Open the campaign. Show the escrow goal, empty activity feed, milestones, creator address, and local time controls.
4. Switch MetaMask to a backer. Use the faucet, enter a contribution, and click **Approve and contribute**. Point out the two MetaMask transactions and the weighted contribution in the activity feed.
5. Repeat with other backer accounts if time allows. Contributions must reach the goal.
6. Click **To funding deadline**, then **Finalize funding**. Show the Active status.
7. Switch to the creator. Submit a CID for milestone 1.
8. Switch to a backer. Vote yes. Mention that vote weight equals the contribution.
9. Use **3 days**, then **Finalize vote**. Show the 30% creator release and the approval event.
10. For milestone 2, demonstrate a rejection, creator resubmission, and approval.
11. For milestone 3, reject both attempts. Show the Cancelled status.
12. Switch to each backer and click **Claim refund**. Explain that each refund is pro-rata from the unreleased escrow.

## Fast terminal-only fallback

If wallet switching takes too long, run:

```bash
npm run demo
```

Narrate each printed heading and finish on the final account and escrow balances.

## What the recording proves

- Contract deployment and factory registry
- ERC-20 approval and escrow funding
- Deadline enforcement through local time travel
- Contribution-weighted voting with quorum and majority
- Tranche release, one resubmission, cancellation, and pull refunds
- Event-driven UI state and readable transaction feedback
