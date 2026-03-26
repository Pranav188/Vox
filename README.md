# Vox

Vox is a blockchain voting project for learning and experimentation.

It combines:
- a Solidity smart contract (`Election.sol`)
- a React frontend (voter + admin views)
- an Express backend with SQLite (mock DigiLocker identity records + admin APIs)

## What Vox does

- Deploys an `Election` contract with candidate names.
- Lets admins register voters on-chain.
- Lets registered voters cast one vote with MetaMask.
- Prevents unregistered voting and double voting at contract level.
- Provides admin tools to manage citizens, appoint admins, and create new elections.

## Tech stack

- Solidity + Hardhat
- React + Vite + ethers
- Express + better-sqlite3

## Prerequisites

- Node.js + npm
- MetaMask browser extension
- For Sepolia: RPC URL, funded wallet, and private key

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.example .env
```

3. Seed demo citizens into SQLite (optional but recommended):

```bash
npm run seed
```

## Run locally (Hardhat localhost)

Use separate terminals:

1. Start local chain:

```bash
npx hardhat node
```

2. Deploy contract:

```bash
npm run deploy:localhost
```

3. Make sure `.env` uses localhost frontend network:

```env
VITE_ELECTION_NETWORK=localhost
```

4. Start backend API:

```bash
npm run server
```

5. Start frontend:

```bash
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Run with Sepolia (optional)

1. Set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` in `.env`.
2. Deploy:

```bash
npm run deploy:sepolia
```

3. Update the Sepolia contract address in `src/lib/election.js` as printed by the deploy script.
4. Set:

```env
VITE_ELECTION_NETWORK=sepolia
```

5. Run backend and frontend (`npm run server`, `npm run dev`).

## Useful scripts

- `npm run dev` - start Vite frontend
- `npm run server` - start Express backend
- `npm run seed` - seed demo citizens into `server.db`
- `npm run deploy:localhost` - deploy election contract to local Hardhat node
- `npm run deploy:sepolia` - deploy election contract to Sepolia
- `npm run lint` - run ESLint
- `npm run build` - build frontend
- `npm run start` - build frontend and start backend (production-style)

## Tests and checks

```bash
npx hardhat test
npm run lint
npm run build
```

Manual QA checklist: `docs/frontend-manual-test-checklist.md`

## License

MIT - see `LICENSE`.
