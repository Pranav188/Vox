# Frontend Manual Test Checklist

Use this checklist to validate role clarity, wallet switching, and transaction feedback in the Vox frontend.

## Preconditions
- Hardhat node is running on `http://127.0.0.1:8545`
- Election contract is deployed to the configured local address
- MetaMask is installed and has at least 3 local test accounts:
  - admin wallet (deployer)
  - voter wallet (registered by admin)
  - viewer wallet (not registered)

## 1) Disconnected State
1. Open the app without connecting MetaMask.
2. Confirm the role banner shows `Disconnected`.
3. Confirm vote and admin controls are disabled with clear helper text.
4. Confirm global status explains that wallet connection is required.

## 2) Wrong Network State
1. Connect MetaMask on a non-`31337` chain.
2. Confirm the role banner shows `Wrong network`.
3. Confirm controls remain disabled with guidance to switch to Hardhat Localhost.
4. Confirm global status clearly mentions expected chain/network.

## 3) Admin Wallet Flow
1. Switch to the admin wallet on Hardhat Localhost.
2. Confirm the role banner and section chips show `Admin`.
3. Register a voter address.
4. Validate transaction states:
   - pending message appears
   - success message appears after confirmation
5. Open voting, then close voting, validating pending/success/error feedback each time.

## 4) Registered Voter Flow
1. Switch to a wallet that was registered by admin.
2. Confirm role updates to `Voter`.
3. Confirm admin controls are disabled with clear `Admin only` guidance.
4. With voting open, submit a vote and confirm pending/success feedback.
5. Confirm voting results refresh after successful transaction.

## 5) Viewer Wallet Flow
1. Switch to a connected wallet that is not registered.
2. Confirm role shows `Viewer`.
3. Confirm vote action is disabled with a clear registration explanation.
4. Confirm admin controls stay disabled with `Admin only` guidance.

## 6) Wallet Switching Clarity
1. Switch from admin -> voter -> viewer wallets.
2. Confirm role chip, role banner text, and disabled reasons update immediately after each switch.
3. Confirm previous/current wallet context messaging appears for switch events.

## 7) Chain Switching Clarity
1. While connected, switch away from Hardhat Localhost and then back.
2. Confirm role and action availability update correctly on each change.
3. Confirm status guidance updates to reflect current chain state.

## 8) Acceptance Commands
1. Run `npm run lint`.
2. Run `npm run build`.
3. Confirm both commands pass before opening PR.
