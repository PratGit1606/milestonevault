# Frontend

Small Next.js App Router client for the local MilestoneVault demo. It uses ethers v6 and MetaMask with no UI library.

## Run locally

From the repository root:

```bash
npm install
npx hardhat compile
npm run abi
npm run node
```

In a second terminal:

```bash
npm run deploy:local
```

That command writes `frontend/.env.local` with:

```text
NEXT_PUBLIC_USDC_ADDRESS=<deployed token>
NEXT_PUBLIC_FACTORY_ADDRESS=<deployed factory>
```

In a third terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## MetaMask

Add a network with:

- Network name: Hardhat Local
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency symbol: ETH

Import one of the test private keys printed by the Hardhat node. Never use those accounts or keys on a public network.

The local-only dev panel can skip one day, three days, or directly to the funding deadline. Pinata is optional. Enter any CID string when submitting milestone evidence.
