import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import { LOCAL_ELECTION, getReadOnlyElectionContract } from "./lib/election";

const learningTrack = [
  "Contract source defines election rules.",
  "Compilation creates ABI and bytecode.",
  "Deployment makes the contract live at an address.",
  "React reads that on-chain state through ethers.",
];

const sampleCandidates = [
  {
    id: "sample-1",
    name: "Candidate Alpha",
    rank: 1,
    profile: {
      party: "People First Alliance",
      symbol: "Torch",
      constituency: "Central District",
      keyPromise: "Clean energy transition with local jobs.",
      summary: "Former city planner focused on infrastructure and climate policy.",
      priorities: ["Public transport", "Local jobs", "Clean power"],
    },
  },
  {
    id: "sample-2",
    name: "Candidate Beta",
    rank: 2,
    profile: {
      party: "Civic Progress Party",
      symbol: "Bridge",
      constituency: "River Ward",
      keyPromise: "Affordable healthcare and digital public services.",
      summary: "Community health advocate with a policy-first campaign.",
      priorities: ["Healthcare access", "Digital services", "Education"],
    },
  },
  {
    id: "sample-3",
    name: "Candidate Gamma",
    rank: 3,
    profile: {
      party: "Independent Reform Bloc",
      symbol: "Compass",
      constituency: "North Borough",
      keyPromise: "Transparent budgeting and anti-corruption reforms.",
      summary: "Independent candidate focused on governance reform.",
      priorities: ["Transparency", "Small business", "Safety"],
    },
  },
];

const fallbackParties = [
  "People First Alliance",
  "Civic Progress Party",
  "Independent Reform Bloc",
  "Future Development Front",
  "Unity and Growth Movement",
];

const fallbackSymbols = ["Torch", "Bridge", "Compass", "Leaf", "Star"];

const fallbackConstituencies = [
  "Central District",
  "River Ward",
  "North Borough",
  "South Quarter",
  "East Circle",
];

const DETAIL_ANIMATION_MS = 360;

function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getFallbackProfile(index, name) {
  const pick = index % fallbackParties.length;

  return {
    party: fallbackParties[pick],
    symbol: fallbackSymbols[pick],
    constituency: fallbackConstituencies[pick],
    keyPromise: `${name} focuses on practical local development and accountable governance.`,
    summary: `${name} is participating in this local election with a community-focused campaign agenda.`,
    priorities: ["Local development", "Public services", "Transparent governance"],
  };
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
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [flippedCards, setFlippedCards] = useState({});
  const [activeCandidateDetails, setActiveCandidateDetails] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailMotion, setDetailMotion] = useState({ dx: 0, dy: 0, sx: 1, sy: 1 });
  const clickTimeoutsRef = useRef({});
  const closeDetailTimeoutRef = useRef(null);

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

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsContextOpen(false);
        closeCandidateDetails();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  });

  useEffect(() => {
    const currentTimeouts = clickTimeoutsRef.current;

    return () => {
      Object.values(currentTimeouts).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });

      if (closeDetailTimeoutRef.current) {
        clearTimeout(closeDetailTimeoutRef.current);
      }
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

  const candidateMetrics = useMemo(() => {
    const totalVotes = electionState.candidates.reduce((sum, candidate) => sum + candidate.voteCount, 0);
    const sortedByVotes = [...electionState.candidates].sort(
      (a, b) => b.voteCount - a.voteCount || a.index - b.index,
    );
    const rankByIndex = new Map(sortedByVotes.map((candidate, index) => [candidate.index, index + 1]));
    const leadingVoteCount = sortedByVotes.length > 0 ? sortedByVotes[0].voteCount : 0;

    const candidates = electionState.candidates.map((candidate) => ({
      ...candidate,
      id: `real-${candidate.index}`,
      rank: rankByIndex.get(candidate.index) || electionState.candidates.length,
      voteShare: totalVotes === 0 ? 0 : (candidate.voteCount / totalVotes) * 100,
      isLeading: totalVotes > 0 && candidate.voteCount === leadingVoteCount,
      profile: getFallbackProfile(candidate.index, candidate.name),
      isSample: false,
    }));

    return {
      totalVotes,
      candidates,
    };
  }, [electionState.candidates]);

  const cardsToRender = useMemo(() => {
    if (isLoading || candidateMetrics.candidates.length === 0) {
      return sampleCandidates.map((candidate) => ({
        id: candidate.id,
        index: candidate.rank,
        name: candidate.name,
        voteCount: 0,
        rank: candidate.rank,
        voteShare: 0,
        isLeading: false,
        isSample: true,
        profile: candidate.profile,
      }));
    }

    return candidateMetrics.candidates;
  }, [candidateMetrics.candidates, isLoading]);

  function handleCardClick(candidateId) {
    const existingTimer = clickTimeoutsRef.current[candidateId];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    clickTimeoutsRef.current[candidateId] = setTimeout(() => {
      setFlippedCards((current) => ({
        ...current,
        [candidateId]: !current[candidateId],
      }));
      delete clickTimeoutsRef.current[candidateId];
    }, 220);
  }

  function handleCardDoubleClick(candidate, event) {
    const existingTimer = clickTimeoutsRef.current[candidate.id];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete clickTimeoutsRef.current[candidate.id];
    }

    const sourceRect = event.currentTarget.getBoundingClientRect();
    const modalWidth = Math.min(640, window.innerWidth - 40);
    const modalHeight = Math.min(540, window.innerHeight - 40);
    const fromX = sourceRect.left + sourceRect.width / 2;
    const fromY = sourceRect.top + sourceRect.height / 2;
    const toX = window.innerWidth / 2;
    const toY = window.innerHeight / 2;

    setDetailMotion({
      dx: fromX - toX,
      dy: fromY - toY,
      sx: sourceRect.width / modalWidth,
      sy: sourceRect.height / modalHeight,
    });
    setActiveCandidateDetails(candidate);
    setIsDetailOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsDetailOpen(true);
      });
    });
  }

  function closeCandidateDetails() {
    setIsDetailOpen(false);

    if (closeDetailTimeoutRef.current) {
      clearTimeout(closeDetailTimeoutRef.current);
    }

    closeDetailTimeoutRef.current = setTimeout(() => {
      setActiveCandidateDetails(null);
    }, DETAIL_ANIMATION_MS);
  }

  const isCorrectNetwork = walletState.chainId === LOCAL_ELECTION.chainId;
  const isAdmin =
    walletState.account &&
    electionState.admin &&
    walletState.account.toLowerCase() === electionState.admin.toLowerCase();

  const contextStatusTone = useMemo(() => {
    const text = status.toLowerCase();

    if (
      text.includes("failed") ||
      text.includes("could not") ||
      text.includes("wrong network") ||
      text.includes("not installed") ||
      text.includes("required")
    ) {
      return "error";
    }

    if (walletState.account && isCorrectNetwork) {
      return "success";
    }

    return "neutral";
  }, [status, walletState.account, isCorrectNetwork]);

  return (
    <div className="app-shell">
      <div className="background-grid" />

      <button
        aria-expanded={isContextOpen}
        aria-label="Open connection context"
        className="context-toggle"
        onClick={() => setIsContextOpen((open) => !open)}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M3.5 9.5a12.2 12.2 0 0 1 17 0" />
          <path d="M6.8 13a7.8 7.8 0 0 1 10.4 0" />
          <path d="M10.2 16.3a3.6 3.6 0 0 1 3.6 0" />
          <circle cx="12" cy="19" r="1.2" />
        </svg>
      </button>

      <div
        aria-hidden={!isContextOpen}
        className={`context-overlay ${isContextOpen ? "open" : ""}`}
        onClick={() => setIsContextOpen(false)}
      />

      <aside aria-hidden={!isContextOpen} className={`context-popover ${isContextOpen ? "open" : ""}`}>
        <div className="context-popover-head">
          <p className="panel-label">Connection context</p>
          <button
            aria-label="Close context panel"
            className="context-close"
            onClick={() => setIsContextOpen(false)}
            type="button"
          >
            x
          </button>
        </div>

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
          <span>Wallet</span>
          <strong>{walletState.account ? shortenAddress(walletState.account) : "Not connected"}</strong>
        </div>
        <div className="status-row">
          <span>Voting</span>
          <strong>{electionState.votingOpen ? "Open" : "Closed"}</strong>
        </div>

        <button className="primary-button context-connect" onClick={connectWallet} type="button">
          {walletState.account ? "Reconnect MetaMask" : "Connect MetaMask"}
        </button>
        <p className={`context-status ${contextStatusTone}`}>{status}</p>
      </aside>

      <header className="page-header">
        <p className="eyebrow">Vox Election MVP</p>
        <h1>Live contract data, cleaner flow.</h1>
        <p className="hero-copy">
          Scroll down once from this intro to reach the election section, then continue to admin controls.
        </p>
      </header>

      <main className="page-flow">
        <section className="panel live-panel">
          <div className="live-subsection live-subsection-intro">
            <div className="panel-header">
              <div>
                <p className="panel-label">Live election</p>
                <h2>{electionState.electionName || "Loading election..."}</h2>
              </div>
              <p className="panel-subtext">Real-time values are read directly from the deployed smart contract.</p>
            </div>
          </div>

          <div className="live-subsection live-subsection-meta">
            <p className="subsection-label">Election overview metadata</p>
            <div className="poll-meta">
              <span>Candidates: {electionState.candidateCount}</span>
              <span>Total votes: {candidateMetrics.totalVotes}</span>
              <span>Chain ID: {LOCAL_ELECTION.chainId}</span>
            </div>
          </div>

          <div className="live-subsection live-subsection-list">
            <div className="candidate-head">
              <p className="subsection-label">Candidate list</p>
              <span className={electionState.votingOpen ? "badge badge-live" : "badge"}>
                {electionState.votingOpen ? "Voting is live" : "Voting is closed"}
              </span>
            </div>

            <div className="poll-list">
              {cardsToRender.map((candidate) => {
                const isFlipped = Boolean(flippedCards[candidate.id]);

                return (
                  <article
                    className={`poll-card interactive-card ${candidate.isLeading ? "poll-card-leading" : ""} ${
                      candidate.isSample ? "poll-card-sample" : ""
                    } ${isFlipped ? "flipped" : ""}`}
                    key={candidate.id}
                    onClick={() => handleCardClick(candidate.id)}
                    onDoubleClick={(event) => handleCardDoubleClick(candidate, event)}
                  >
                    <div className="poll-card-inner">
                      <div className="poll-card-face poll-card-front">
                        <div className="poll-card-header">
                          <div>
                            <h3>{candidate.name}</h3>
                            <div className="poll-card-meta-row">
                              <span className="poll-id">Rank #{candidate.rank}</span>
                              <span className="meta-divider" />
                              <span className="poll-id">{candidate.profile.party}</span>
                            </div>
                          </div>
                          <span className={candidate.isLeading ? "badge badge-live" : "badge"}>
                            {candidate.voteCount} vote{candidate.voteCount === 1 ? "" : "s"}
                          </span>
                        </div>

                        <p className="poll-face-note">Click to flip for voter details, double-click for full profile.</p>

                        <div className="poll-card-footer">
                          {candidate.isSample ? (
                            <button className="option-button" disabled type="button">
                              <span>Connect and deploy to vote</span>
                              <strong>Send transaction</strong>
                            </button>
                          ) : (
                            <button
                              className="option-button"
                              disabled={
                                !walletState.account ||
                                !electionState.votingOpen ||
                                !isCorrectNetwork ||
                                isSubmittingVote
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                voteForCandidate(candidate.index);
                              }}
                              type="button"
                            >
                              <span>Vote for {candidate.name}</span>
                              <strong>{isSubmittingVote ? "Submitting..." : "Send transaction"}</strong>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="poll-card-face poll-card-back">
                        <p className="subsection-label">Voter details</p>
                        <div className="candidate-back-grid">
                          <p>
                            <strong>Party:</strong> {candidate.profile.party}
                          </p>
                          <p>
                            <strong>Symbol:</strong> {candidate.profile.symbol}
                          </p>
                          <p>
                            <strong>Constituency:</strong> {candidate.profile.constituency}
                          </p>
                          <p>
                            <strong>Key promise:</strong> {candidate.profile.keyPromise}
                          </p>
                        </div>
                        <p className="poll-face-note">Click again to return. Double-click for full details.</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel admin-panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Admin controls</p>
              <h2>Run the election lifecycle</h2>
            </div>
          </div>

          <div className="admin-section">
            <p className="subsection-label">Voter registration</p>
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
              <p className="helper-text">Use a valid wallet address on the local Hardhat network.</p>
              <button
                className="primary-button form-submit"
                disabled={!isAdmin || !isCorrectNetwork || isSubmittingAdminAction}
                type="submit"
              >
                Register voter
              </button>
            </form>
          </div>

          <div className="admin-section">
            <p className="subsection-label">Admin actions</p>
            <div className="admin-action-row">
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
            </div>
            {!isAdmin && (
              <p className="helper-text">Connect as the admin wallet to use registration and open/close controls.</p>
            )}
          </div>

          <div className="rule-list rule-list-muted top-gap">
            {learningTrack.map((principle) => (
              <div className="rule-item" key={principle}>
                <span className="rule-mark" />
                <p>{principle}</p>
              </div>
            ))}
            <div className="rule-item">
              <span className="rule-mark" />
              <p>MetaMask provides the signer, so the contract can trust msg.sender during voting.</p>
            </div>
          </div>
        </section>
      </main>

      {activeCandidateDetails && (
        <div
          className={`candidate-modal-overlay ${isDetailOpen ? "open" : ""}`}
          onClick={closeCandidateDetails}
        >
          <div
            className={`candidate-modal ${isDetailOpen ? "open" : ""}`}
            onClick={(event) => event.stopPropagation()}
            style={{
              "--morph-dx": `${detailMotion.dx}px`,
              "--morph-dy": `${detailMotion.dy}px`,
              "--morph-sx": detailMotion.sx,
              "--morph-sy": detailMotion.sy,
            }}
          >
            <div className="candidate-modal-head">
              <div>
                <p className="panel-label">Candidate profile</p>
                <h3>{activeCandidateDetails.name}</h3>
              </div>
              <button
                aria-label="Close candidate details"
                className="context-close"
                onClick={closeCandidateDetails}
                type="button"
              >
                x
              </button>
            </div>

            <div className="candidate-modal-grid">
              <p>
                <strong>Party:</strong> {activeCandidateDetails.profile.party}
              </p>
              <p>
                <strong>Symbol:</strong> {activeCandidateDetails.profile.symbol}
              </p>
              <p>
                <strong>Constituency:</strong> {activeCandidateDetails.profile.constituency}
              </p>
              <p>
                <strong>Vote share:</strong> {activeCandidateDetails.voteShare.toFixed(1)}%
              </p>
              <p>
                <strong>Campaign summary:</strong> {activeCandidateDetails.profile.summary}
              </p>
              <p>
                <strong>Key promise:</strong> {activeCandidateDetails.profile.keyPromise}
              </p>
            </div>

            <p className="candidate-modal-priority-title">Top priorities</p>
            <div className="candidate-priority-list">
              {activeCandidateDetails.profile.priorities.map((priority) => (
                <span className="badge" key={priority}>
                  {priority}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
