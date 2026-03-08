import { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import { LOCAL_ELECTION, getReadOnlyElectionContract } from "./lib/election";

const learningTrack = [
  "Contract source defines election rules.",
  "Compilation creates ABI and bytecode.",
  "Deployment makes the contract live at an address.",
  "React reads that on-chain state through ethers.",
];

function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function App() {
  const [walletState, setWalletState] = useState({
    account: "",
    chainId: null,
  });
  const [electionState, setElectionState] = useState({
    electionName: "",
    admin: "",
    votingOpen: false,
    candidateCount: 0,
    candidates: [],
  });
  const [status, setStatus] = useState("Connecting to the local blockchain...");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [adminForm, setAdminForm] = useState({
    voterAddress: "",
  });
  const [isSubmittingAdminAction, setIsSubmittingAdminAction] = useState(false);

  useEffect(() => {
    refreshElectionState();
  }, []);

  useEffect(() => {
    async function loadWalletState() {
      if (!window.ethereum) {
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      const network = await provider.getNetwork();

      setWalletState({
        account: accounts[0] || "",
        chainId: Number(network.chainId),
      });
    }

    loadWalletState();

    if (!window.ethereum) {
      return undefined;
    }

    function handleAccountsChanged(accounts) {
      setWalletState((currentState) => ({
        ...currentState,
        account: accounts[0] || "",
      }));
    }

    function handleChainChanged(chainIdHex) {
      setWalletState((currentState) => ({
        ...currentState,
        chainId: Number.parseInt(chainIdHex, 16),
      }));
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  async function refreshElectionState() {
    setIsLoading(true);

    try {
      const contract = getReadOnlyElectionContract();
      const electionName = await contract.electionName();
      const admin = await contract.admin();
      const votingOpen = await contract.votingOpen();
      const candidateCount = Number(await contract.getCandidateCount());
      const candidates = [];

      for (let index = 0; index < candidateCount; index += 1) {
        const candidate = await contract.candidates(index);
        candidates.push({
          index,
          name: candidate.name,
          voteCount: Number(candidate.voteCount),
        });
      }

      setElectionState({
        electionName,
        admin,
        votingOpen,
        candidateCount,
        candidates,
      });
      setStatus("Read-only frontend is connected to the deployed Election contract.");
    } catch (error) {
      setStatus(
        error.message ||
          "Could not read the local contract. Make sure the Hardhat node is running and Election is deployed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function getBrowserContract(signer) {
    return new ethers.Contract(
      LOCAL_ELECTION.contractAddress,
      getReadOnlyElectionContract().interface,
      signer,
    );
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus("MetaMask is not installed in this browser.");
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7a69" }],
      });
    } catch (error) {
      if (error.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x7a69",
              chainName: LOCAL_ELECTION.chainName,
              rpcUrls: [LOCAL_ELECTION.rpcUrl],
              nativeCurrency: {
                name: "Ethereum",
                symbol: "ETH",
                decimals: 18,
              },
            },
          ],
        });
      } else {
        setStatus(error.message || "Could not switch MetaMask to the local Hardhat network.");
        return;
      }
    }

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    setWalletState({
      account: accounts[0] || "",
      chainId: LOCAL_ELECTION.chainId,
    });
    setStatus("Wallet connected. You can now send vote transactions from the UI.");
  }

  async function voteForCandidate(candidateIndex) {
    if (!window.ethereum) {
      setStatus("MetaMask is required for voting.");
      return;
    }

    if (walletState.chainId !== LOCAL_ELECTION.chainId) {
      setStatus("Switch MetaMask to Hardhat Localhost before voting.");
      return;
    }

    try {
      setIsSubmittingVote(true);
      setStatus(`Submitting vote for candidate ${candidateIndex}...`);

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const contract = getBrowserContract(signer);

      const tx = await contract.vote(candidateIndex);
      await tx.wait();

      setStatus("Vote confirmed on-chain. Refreshing election state...");
      await refreshElectionState();
    } catch (error) {
      setStatus(error.shortMessage || error.message || "Vote transaction failed.");
    } finally {
      setIsSubmittingVote(false);
    }
  }

  async function registerVoterFromUi(event) {
    event.preventDefault();

    if (!window.ethereum) {
      setStatus("MetaMask is required for admin actions.");
      return;
    }

    if (walletState.chainId !== LOCAL_ELECTION.chainId) {
      setStatus("Switch MetaMask to Hardhat Localhost before registering voters.");
      return;
    }

    try {
      setIsSubmittingAdminAction(true);
      setStatus(`Registering voter ${adminForm.voterAddress}...`);

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const contract = getBrowserContract(signer);

      const tx = await contract.registerVoter(adminForm.voterAddress.trim());
      await tx.wait();

      setAdminForm({ voterAddress: "" });
      setStatus("Voter registered on-chain.");
      await refreshElectionState();
    } catch (error) {
      setStatus(error.shortMessage || error.message || "Register voter transaction failed.");
    } finally {
      setIsSubmittingAdminAction(false);
    }
  }

  async function openVotingFromUi() {
    if (!window.ethereum) {
      setStatus("MetaMask is required for admin actions.");
      return;
    }

    if (walletState.chainId !== LOCAL_ELECTION.chainId) {
      setStatus("Switch MetaMask to Hardhat Localhost before opening voting.");
      return;
    }

    try {
      setIsSubmittingAdminAction(true);
      setStatus("Opening voting on-chain...");

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const contract = getBrowserContract(signer);

      const tx = await contract.openVoting();
      await tx.wait();

      setStatus("Voting opened on-chain.");
      await refreshElectionState();
    } catch (error) {
      setStatus(error.shortMessage || error.message || "Open voting transaction failed.");
    } finally {
      setIsSubmittingAdminAction(false);
    }
  }

  async function closeVotingFromUi() {
    if (!window.ethereum) {
      setStatus("MetaMask is required for admin actions.");
      return;
    }

    if (walletState.chainId !== LOCAL_ELECTION.chainId) {
      setStatus("Switch MetaMask to Hardhat Localhost before closing voting.");
      return;
    }

    try {
      setIsSubmittingAdminAction(true);
      setStatus("Closing voting on-chain...");

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const contract = getBrowserContract(signer);

      const tx = await contract.closeVoting();
      await tx.wait();

      setStatus("Voting closed on-chain.");
      await refreshElectionState();
    } catch (error) {
      setStatus(error.shortMessage || error.message || "Close voting transaction failed.");
    } finally {
      setIsSubmittingAdminAction(false);
    }
  }

  const isCorrectNetwork = walletState.chainId === LOCAL_ELECTION.chainId;
  const isAdmin =
    walletState.account &&
    electionState.admin &&
    walletState.account.toLowerCase() === electionState.admin.toLowerCase();

  return (
    <div className="app-shell">
      <div className="background-grid" />

      <header className="hero">
        <div>
          <p className="eyebrow">Vox Election MVP</p>
          <h1>Frontend is now reading the live election contract.</h1>
          <p className="hero-copy">
            This is the first real frontend integration step. The React app is not voting yet, but it is already
            reading the deployed contract from the local blockchain and rendering real election state.
          </p>
        </div>

        <div className="status-panel">
          <div className="status-row">
            <span>Network</span>
            <strong>{LOCAL_ELECTION.chainName}</strong>
          </div>
          <div className="status-row">
            <span>Contract</span>
            <strong>{shortenAddress(LOCAL_ELECTION.contractAddress)}</strong>
          </div>
          <div className="status-row">
            <span>Admin</span>
            <strong>{electionState.admin ? shortenAddress(electionState.admin) : "Loading..."}</strong>
          </div>
          <div className="status-row">
            <span>Status</span>
            <strong>{electionState.votingOpen ? "Voting Open" : "Voting Closed"}</strong>
          </div>
          <div className="status-row">
            <span>Wallet</span>
            <strong>{walletState.account ? shortenAddress(walletState.account) : "Not connected"}</strong>
          </div>
          <button className="primary-button" onClick={connectWallet} type="button">
            {walletState.account ? "Reconnect MetaMask" : "Connect MetaMask"}
          </button>
          {walletState.account && !isCorrectNetwork && (
            <p className="warning-text">MetaMask is connected to the wrong network. Switch to Hardhat Localhost.</p>
          )}
          <p className="status-copy">{status}</p>
        </div>
      </header>

      <main className="dashboard">
        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-label">Live election</p>
              <h2>{electionState.electionName || "Loading election..."}</h2>
            </div>
            <p className="panel-subtext">
              The data in this section comes from the deployed smart contract, not hardcoded React state.
            </p>
          </div>

          <div className="poll-meta">
            <span>Candidates: {electionState.candidateCount}</span>
            <span>RPC: {LOCAL_ELECTION.rpcUrl}</span>
            <span>Chain ID: {LOCAL_ELECTION.chainId}</span>
          </div>

          <div className="poll-list">
            {isLoading && <p className="empty-state">Loading election data from the local blockchain...</p>}

            {!isLoading &&
              electionState.candidates.map((candidate) => (
                <article className="poll-card" key={candidate.index}>
                  <div className="poll-card-header">
                    <div>
                      <p className="poll-id">Candidate {candidate.index}</p>
                      <h3>{candidate.name}</h3>
                    </div>
                    <span className={electionState.votingOpen ? "badge badge-live" : "badge"}>
                      {candidate.voteCount} vote{candidate.voteCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <button
                    className="option-button"
                    disabled={
                      !walletState.account ||
                      !electionState.votingOpen ||
                      !isCorrectNetwork ||
                      isSubmittingVote
                    }
                    onClick={() => voteForCandidate(candidate.index)}
                    type="button"
                  >
                    <span>Vote for {candidate.name}</span>
                    <strong>{isSubmittingVote ? "Submitting..." : "Send transaction"}</strong>
                  </button>
                </article>
              ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Admin controls</p>
              <h2>Run the election lifecycle</h2>
            </div>
          </div>

          <form className="poll-form" onSubmit={registerVoterFromUi}>
            <label>
              Voter address
              <input
                type="text"
                value={adminForm.voterAddress}
                onChange={(event) => setAdminForm({ voterAddress: event.target.value })}
                placeholder="0x..."
                required
              />
            </label>

            <button
              className="primary-button"
              disabled={!isAdmin || !isCorrectNetwork || isSubmittingAdminAction}
              type="submit"
            >
              Register voter
            </button>

            <button
              className="secondary-button"
              disabled={!isAdmin || !isCorrectNetwork || electionState.votingOpen || isSubmittingAdminAction}
              onClick={openVotingFromUi}
              type="button"
            >
              Open voting
            </button>

            <button
              className="secondary-button"
              disabled={!isAdmin || !isCorrectNetwork || !electionState.votingOpen || isSubmittingAdminAction}
              onClick={closeVotingFromUi}
              type="button"
            >
              Close voting
            </button>
          </form>

          <div className="rule-list top-gap">
            {learningTrack.map((principle) => (
              <div className="rule-item" key={principle}>
                <span className="rule-mark" />
                <p>{principle}</p>
              </div>
            ))}
            <div className="rule-item">
              <span className="rule-mark" />
              <p>MetaMask provides the signer, so the contract can trust `msg.sender` during voting.</p>
            </div>
            {!isAdmin && (
              <div className="rule-item">
                <span className="rule-mark" />
                <p>Connect as the admin wallet to use registration and open/close controls.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
