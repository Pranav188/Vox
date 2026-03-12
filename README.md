# Vox

Vox is a learning-first blockchain election MVP built with Solidity, Hardhat, React, ethers, and MetaMask.

## Current state

- election contract, tests, deployment script, and frontend are wired together
- frontend has separate `#/vote` and `#/admin` routes
- frontend reads ABI from the compiled Hardhat artifact
- network selection is config-driven for localhost vs Sepolia

## Local development

1. Start the local node:
   `npx hardhat node`
2. Deploy the contract:
   `npx hardhat run scripts/deploy-election.js --network localhost`
3. Run the frontend:
   `npm run dev`

## Frontend network config

Copy `.env.example` to `.env` and adjust values if needed.

Available Vite env vars:

- `VITE_ELECTION_NETWORK`
- `VITE_ELECTION_RPC_URL`
- `VITE_ELECTION_CHAIN_ID`
- `VITE_ELECTION_CHAIN_NAME`
- `VITE_ELECTION_CONTRACT_ADDRESS`

Defaults:

- `localhost` is the default active network
- Sepolia is prepared in the frontend config, but you must provide a deployed contract address before using it

## Checks

- Contract tests: `npx hardhat test`
- Lint: `npm run lint`
- Build: `npm run build`

## Manual testing

- Wallet/role/transaction checklist: `docs/frontend-manual-test-checklist.md`
