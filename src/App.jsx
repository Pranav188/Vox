import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { flushSync } from "react-dom";
import "./App.css";
import { LOCAL_ELECTION, getReadOnlyElectionContract } from "./lib/election";

const learningTrack = [
  "Contract source defines election rules.",
  "Compilation creates ABI and bytecode.",
  "Deployment makes the contract live at an address.",
  "React reads that on-chain state through ethers.",
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
const ROUTE_TRANSITION_MODES = ["zoom"];
const BACKGROUND_MODES = ["continuous"];
const DEFAULT_ROUTE_TRANSITION = "zoom";
const DEFAULT_BACKGROUND_MODE = "continuous";

function getExperienceConfig() {
  if (typeof window === "undefined") {
    return {
      transitionMode: DEFAULT_ROUTE_TRANSITION,
      backgroundMode: DEFAULT_BACKGROUND_MODE,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const transitionMode = params.get("transition");
  const backgroundMode = params.get("bg");

  return {
    transitionMode: ROUTE_TRANSITION_MODES.includes(transitionMode)
      ? transitionMode
      : DEFAULT_ROUTE_TRANSITION,
    backgroundMode: BACKGROUND_MODES.includes(backgroundMode) ? backgroundMode : DEFAULT_BACKGROUND_MODE,
  };
}

function getCurrentView() {
  if (typeof window === "undefined") {
    return "vote";
  }

  return window.location.hash === "#/admin" ? "admin" : "vote";
}

function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortenHash(hash) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
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

function makeStatus(type, stage, action, message, txHash = "") {
  return { type, stage, action, message, txHash };
}

function normalizeError(error, fallbackMessage) {
  const candidates = [
    error?.reason,
    error?.revert?.args?.[0],
    error?.info?.error?.data?.reason,
    error?.info?.error?.message,
    error?.error?.data?.reason,
    error?.error?.message,
    error?.data?.reason,
    error?.data?.message,
    error?.shortMessage,
    error?.message,
    fallbackMessage,
  ];

  const source =
    candidates.find((value) => typeof value === "string" && value.trim().length > 0) || fallbackMessage;

  return source
    .replace("execution reverted: ", "")
    .replace('VM Exception while processing transaction: reverted with reason string "', "")
    .replace("reverted with reason string ", "")
    .replace(/^Error: /u, "")
    .replace(/^missing revert data$/u, fallbackMessage)
    .replace(/^Internal JSON-RPC error\./u, "")
    .replace(/^MetaMask Tx Signature: User denied transaction signature\./u, "Transaction rejected in MetaMask.")
    .replace(/^MetaMask Tx Signature: /u, "")
    .replace(/"$/u, "")
    .replace(/\(action=.*$/u, "")
    .trim();
}

function renderStatusLine(feedback, className = "") {
  if (!feedback) {
    return null;
  }

  return <p className={`inline-feedback ${feedback.type} ${className}`.trim()}>{feedback.message}</p>;
}

function App() {
  const experienceConfig = useMemo(() => getExperienceConfig(), []);
  const routeTransitionMode = experienceConfig.transitionMode;
  const backgroundMode = experienceConfig.backgroundMode;
  const supportsViewTransitions =
    typeof document !== "undefined" && typeof document.startViewTransition === "function";
  const [currentView, setCurrentView] = useState(getCurrentView);
  const [isRouteAnimating, setIsRouteAnimating] = useState(false);
  const [routeTransitionDirection, setRouteTransitionDirection] = useState("forward");
  const [walletState, setWalletState] = useState({
    account: "",
    chainId: null,
  });
  const [previousAccount, setPreviousAccount] = useState("");
  const [electionState, setElectionState] = useState({
    electionName: "",
    admin: "",
    votingOpen: false,
    candidateCount: 0,
    candidates: [],
  });
  const [isRegisteredVoter, setIsRegisteredVoter] = useState(false);
  const [isResolvingRole, setIsResolvingRole] = useState(false);
  const [status, setStatus] = useState(
    makeStatus("info", "idle", "init", "Connecting to the local blockchain..."),
  );
  const [actionStatus, setActionStatus] = useState({
    vote: null,
    registerVoter: null,
    openVoting: null,
    closeVoting: null,
  });
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
  const routeTransitionTimerRef = useRef(null);
  const backgroundInertiaRafRef = useRef(null);
  const appShellRef = useRef(null);
  const pageHeaderRef = useRef(null);

  const isCorrectNetwork = walletState.chainId === LOCAL_ELECTION.chainId;
  const isAdmin =
    walletState.account &&
    electionState.admin &&
    walletState.account.toLowerCase() === electionState.admin.toLowerCase();

  const roleState = useMemo(() => {
    if (!walletState.account) {
      return { key: "disconnected", label: "Disconnected" };
    }

    if (!isCorrectNetwork) {
      return { key: "wrong_network", label: "Wrong network" };
    }

    if (isAdmin) {
      return { key: "admin", label: "Admin" };
    }

    if (isRegisteredVoter) {
      return { key: "voter", label: "Voter" };
    }

    return { key: "viewer", label: "Viewer" };
  }, [isAdmin, isCorrectNetwork, isRegisteredVoter, walletState.account]);

  const roleGuidance = useMemo(() => {
    if (roleState.key === "disconnected") {
      return "Connect MetaMask to unlock voting and admin actions.";
    }

    if (roleState.key === "wrong_network") {
      return `Switch MetaMask to ${LOCAL_ELECTION.chainName} to continue testing.`;
    }

    if (roleState.key === "admin") {
      return "You can register voters and open or close voting from the admin panel.";
    }

    if (roleState.key === "voter") {
      return electionState.votingOpen
        ? "Voting is open. You can submit one vote from the candidate cards."
        : "Voting is currently closed. Wait for admin to open voting.";
    }

    return "You can view live election data. Register this wallet as a voter to cast votes.";
  }, [electionState.votingOpen, roleState.key]);

  const networkLabel = useMemo(() => {
    if (!walletState.chainId) {
      return "Not connected";
    }

    if (isCorrectNetwork) {
      return LOCAL_ELECTION.chainName;
    }

    return `Chain ${walletState.chainId} (expected ${LOCAL_ELECTION.chainId})`;
  }, [isCorrectNetwork, walletState.chainId]);

  const updateActionStatus = useCallback((actionKey, feedback) => {
    setActionStatus((current) => ({
      ...current,
      [actionKey]: feedback,
    }));
  }, []);

  const refreshVoterRole = useCallback(async (account, chainId) => {
    if (!account || chainId !== LOCAL_ELECTION.chainId) {
      setIsRegisteredVoter(false);
      setIsResolvingRole(false);
      return;
    }

    try {
      setIsResolvingRole(true);
      const contract = getReadOnlyElectionContract();
      const registered = await contract.isRegisteredVoter(account);
      setIsRegisteredVoter(Boolean(registered));
    } catch {
      setIsRegisteredVoter(false);
    } finally {
      setIsResolvingRole(false);
    }
  }, []);

  const refreshElectionState = useCallback(async () => {
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

      setStatus((currentStatus) => {
        if (currentStatus.stage === "pending") {
          return currentStatus;
        }

        return makeStatus(
          "success",
          "idle",
          "sync",
          "Read-only frontend is connected to the deployed Election contract.",
        );
      });
    } catch (error) {
      setStatus(
        makeStatus(
          "error",
          "error",
          "sync",
          normalizeError(
            error,
            "Could not read the local contract. Make sure the Hardhat node is running and Election is deployed.",
          ),
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshElectionState();
  }, [refreshElectionState]);

  useEffect(() => {
    function handleHashChange() {
      setCurrentView(getCurrentView());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (!appShellRef.current) {
      return;
    }

    appShellRef.current.style.setProperty("--bg-flow-duration", "42s");
    appShellRef.current.style.setProperty("--bg-impulse-x", "0px");
    appShellRef.current.style.setProperty("--bg-flow-sign", "1");
  }, []);

  useLayoutEffect(() => {
    function syncRouteAxis() {
      if (!pageHeaderRef.current || typeof document === "undefined") {
        return;
      }

      const rect = pageHeaderRef.current.getBoundingClientRect();
      const axisY = Math.round(rect.top + rect.height / 2);
      document.documentElement.style.setProperty("--route-axis-y", `${axisY}px`);
    }

    syncRouteAxis();
    window.addEventListener("resize", syncRouteAxis);

    return () => {
      window.removeEventListener("resize", syncRouteAxis);
    };
  }, [currentView]);

  useLayoutEffect(() => {
    if (routeTransitionTimerRef.current) {
      clearTimeout(routeTransitionTimerRef.current);
    }

    if (backgroundInertiaRafRef.current) {
      cancelAnimationFrame(backgroundInertiaRafRef.current);
    }

    const direction = currentView === "admin" ? "forward" : "backward";
    const momentumSign = direction === "forward" ? -1 : 1;
    const flowSign = 1;
    setRouteTransitionDirection(direction);
    setIsRouteAnimating(true);

    if (appShellRef.current) {
      appShellRef.current.style.setProperty("--bg-flow-sign", `${flowSign}`);
    }

    const startAt = performance.now();
    const inertiaDuration = 1000;
    const fastDuration = 20;
    const impulseStart = 140 * momentumSign;

    function animateInertia(now) {
      const t = Math.min(1, (now - startAt) / inertiaDuration);
      const eased = 1 - (1 - t) ** 3;

      if (appShellRef.current) {
        appShellRef.current.style.setProperty(
          "--bg-flow-duration",
          `${fastDuration + (42 - fastDuration) * eased}s`,
        );
        appShellRef.current.style.setProperty("--bg-impulse-x", `${impulseStart * (1 - eased)}px`);
      }

      if (t < 1) {
        backgroundInertiaRafRef.current = requestAnimationFrame(animateInertia);
      } else {
        if (appShellRef.current) {
          appShellRef.current.style.setProperty("--bg-flow-duration", "42s");
          appShellRef.current.style.setProperty("--bg-impulse-x", "0px");
        }
        backgroundInertiaRafRef.current = null;
      }
    }

    backgroundInertiaRafRef.current = requestAnimationFrame(animateInertia);

    const settleDuration = 1000;
    routeTransitionTimerRef.current = setTimeout(() => {
      setIsRouteAnimating(false);
      routeTransitionTimerRef.current = null;
    }, settleDuration);

    return () => {
      if (routeTransitionTimerRef.current) {
        clearTimeout(routeTransitionTimerRef.current);
      }

      if (backgroundInertiaRafRef.current) {
        cancelAnimationFrame(backgroundInertiaRafRef.current);
      }
    };
  }, [currentView, routeTransitionMode]);

  useEffect(() => {
    async function loadWalletState() {
      if (!window.ethereum) {
        setStatus(makeStatus("error", "error", "wallet", "MetaMask is not installed in this browser."));
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
      setWalletState((currentState) => {
        const nextAccount = accounts[0] || "";

        if (currentState.account && nextAccount && currentState.account.toLowerCase() !== nextAccount.toLowerCase()) {
          setPreviousAccount(currentState.account);
          setStatus(
            makeStatus(
              "info",
              "idle",
              "wallet_switch",
              `Wallet switched to ${shortenAddress(nextAccount)}. Role and access have been refreshed.`,
            ),
          );
        }

        if (!nextAccount && currentState.account) {
          setPreviousAccount(currentState.account);
          setStatus(
            makeStatus(
              "info",
              "idle",
              "wallet_disconnect",
              "Wallet disconnected. Connect MetaMask to continue testing actions.",
            ),
          );
        }

        return {
          ...currentState,
          account: nextAccount,
        };
      });
    }

    function handleChainChanged(chainIdHex) {
      const nextChainId = Number.parseInt(chainIdHex, 16);
      setWalletState((currentState) => ({
        ...currentState,
        chainId: nextChainId,
      }));

      if (nextChainId !== LOCAL_ELECTION.chainId) {
        setStatus(
          makeStatus(
            "error",
            "error",
            "network",
            `Wrong network detected. Switch to ${LOCAL_ELECTION.chainName} (${LOCAL_ELECTION.chainId}).`,
          ),
        );
      } else {
        setStatus(
          makeStatus(
            "success",
            "idle",
            "network",
            `${LOCAL_ELECTION.chainName} selected. Actions are available for your current role.`,
          ),
        );
      }
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

      if (routeTransitionTimerRef.current) {
        clearTimeout(routeTransitionTimerRef.current);
      }

      if (backgroundInertiaRafRef.current) {
        cancelAnimationFrame(backgroundInertiaRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    refreshVoterRole(walletState.account, walletState.chainId);
  }, [refreshVoterRole, walletState.account, walletState.chainId, electionState.admin]);

  useEffect(() => {
    if (!previousAccount || !walletState.account) {
      return;
    }

    if (previousAccount.toLowerCase() === walletState.account.toLowerCase()) {
      return;
    }

    setStatus(
      makeStatus(
        "info",
        "idle",
        "wallet_switch",
        `Wallet switched from ${shortenAddress(previousAccount)} to ${shortenAddress(walletState.account)}.`,
      ),
    );
  }, [previousAccount, walletState.account]);

  function getBrowserContract(signer) {
    return new ethers.Contract(
      LOCAL_ELECTION.contractAddress,
      getReadOnlyElectionContract().interface,
      signer,
    );
  }

  function getRoleGuardError({ requiresAdmin = false, requiresRegisteredVoter = false, requiresVotingOpen = false }) {
    if (!window.ethereum) {
      return "MetaMask is required to run this action.";
    }

    if (!walletState.account) {
      return "Connect MetaMask to continue.";
    }

    if (!isCorrectNetwork) {
      return `Switch MetaMask to ${LOCAL_ELECTION.chainName} before continuing.`;
    }

    if (requiresAdmin && !isAdmin) {
      return "This action is available only for the admin wallet.";
    }

    if (requiresRegisteredVoter && !isRegisteredVoter) {
      return "This wallet is not registered as a voter.";
    }

    if (requiresVotingOpen && !electionState.votingOpen) {
      return "Voting is currently closed.";
    }

    return "";
  }

  async function executeContractAction({
    actionKey,
    actionLabel,
    pendingMessage,
    successMessage,
    contractCall,
    postSuccess,
    adminAction = false,
  }) {
    try {
      if (adminAction) {
        setIsSubmittingAdminAction(true);
      } else {
        setIsSubmittingVote(true);
      }

      const pendingStatus = makeStatus("info", "pending", actionKey, pendingMessage);
      setStatus(pendingStatus);
      updateActionStatus(actionKey, pendingStatus);

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const contract = getBrowserContract(signer);

      const tx = await contractCall(contract);
      const submittedMessage = `${actionLabel} submitted. Waiting for confirmation (${shortenHash(tx.hash)}).`;
      const submittedStatus = makeStatus("info", "pending", actionKey, submittedMessage, tx.hash);
      setStatus(submittedStatus);
      updateActionStatus(actionKey, submittedStatus);

      await tx.wait();

      const successStatus = makeStatus("success", "success", actionKey, successMessage, tx.hash);
      setStatus(successStatus);
      updateActionStatus(actionKey, successStatus);

      if (postSuccess) {
        postSuccess();
      }

      await refreshElectionState();
      await refreshVoterRole(walletState.account, walletState.chainId);
    } catch (error) {
      const message = normalizeError(error, `${actionLabel} failed.`);
      const errorStatus = makeStatus("error", "error", actionKey, message);
      setStatus(errorStatus);
      updateActionStatus(actionKey, errorStatus);
    } finally {
      if (adminAction) {
        setIsSubmittingAdminAction(false);
      } else {
        setIsSubmittingVote(false);
      }
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus(makeStatus("error", "error", "connect", "MetaMask is not installed in this browser."));
      return;
    }

    try {
      setStatus(
        makeStatus(
          "info",
          "pending",
          "connect",
          `Requesting ${LOCAL_ELECTION.chainName} in MetaMask before connecting wallet...`,
        ),
      );

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
        setStatus(
          makeStatus(
            "error",
            "error",
            "connect",
            normalizeError(error, "Could not switch MetaMask to the local Hardhat network."),
          ),
        );
        return;
      }
    }

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setWalletState({
        account: accounts[0] || "",
        chainId: LOCAL_ELECTION.chainId,
      });
      setStatus(
        makeStatus(
          "success",
          "success",
          "connect",
          "Wallet connected. Role visibility and action controls have been updated.",
        ),
      );
    } catch (error) {
      setStatus(makeStatus("error", "error", "connect", normalizeError(error, "Wallet connection failed.")));
    }
  }

  async function voteForCandidate(candidateIndex) {
    const guardError = getRoleGuardError({ requiresRegisteredVoter: true, requiresVotingOpen: true });

    if (guardError) {
      const feedback = makeStatus("error", "error", "vote", guardError);
      setStatus(feedback);
      updateActionStatus("vote", feedback);
      return;
    }

    await executeContractAction({
      actionKey: "vote",
      actionLabel: "Vote transaction",
      pendingMessage: `Submitting vote for candidate #${candidateIndex}...`,
      successMessage: "Vote confirmed on-chain. Live results have been refreshed.",
      contractCall: (contract) => contract.vote(candidateIndex),
    });
  }

  async function registerVoterFromUi(event) {
    event.preventDefault();

    const guardError = getRoleGuardError({ requiresAdmin: true });
    if (guardError) {
      const feedback = makeStatus("error", "error", "registerVoter", guardError);
      setStatus(feedback);
      updateActionStatus("registerVoter", feedback);
      return;
    }

    const voterAddress = adminForm.voterAddress.trim();

    if (!ethers.isAddress(voterAddress)) {
      const feedback = makeStatus("error", "error", "registerVoter", "Enter a valid wallet address.");
      setStatus(feedback);
      updateActionStatus("registerVoter", feedback);
      return;
    }

    await executeContractAction({
      actionKey: "registerVoter",
      actionLabel: "Register voter",
      pendingMessage: `Registering voter ${shortenAddress(voterAddress)}...`,
      successMessage: "Voter registered on-chain.",
      contractCall: (contract) => contract.registerVoter(voterAddress),
      postSuccess: () => setAdminForm({ voterAddress: "" }),
      adminAction: true,
    });
  }

  async function openVotingFromUi() {
    const guardError = getRoleGuardError({ requiresAdmin: true });

    if (guardError) {
      const feedback = makeStatus("error", "error", "openVoting", guardError);
      setStatus(feedback);
      updateActionStatus("openVoting", feedback);
      return;
    }

    await executeContractAction({
      actionKey: "openVoting",
      actionLabel: "Open voting",
      pendingMessage: "Opening voting on-chain...",
      successMessage: "Voting is now open on-chain.",
      contractCall: (contract) => contract.openVoting(),
      adminAction: true,
    });
  }

  async function closeVotingFromUi() {
    const guardError = getRoleGuardError({ requiresAdmin: true });

    if (guardError) {
      const feedback = makeStatus("error", "error", "closeVoting", guardError);
      setStatus(feedback);
      updateActionStatus("closeVoting", feedback);
      return;
    }

    await executeContractAction({
      actionKey: "closeVoting",
      actionLabel: "Close voting",
      pendingMessage: "Closing voting on-chain...",
      successMessage: "Voting is now closed on-chain.",
      contractCall: (contract) => contract.closeVoting(),
      adminAction: true,
    });
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
    }));

    return {
      totalVotes,
      candidates,
    };
  }, [electionState.candidates]);
  const hasLiveCandidates = candidateMetrics.candidates.length > 0;
  const showCandidateLoading = isLoading;
  const showCandidateUnavailable = !isLoading && !electionState.electionName && !hasLiveCandidates;

  function getVoteDisabledReason() {
    if (isSubmittingVote) {
      return "A vote transaction is already pending.";
    }

    if (!walletState.account) {
      return "Connect MetaMask to vote.";
    }

    if (!isCorrectNetwork) {
      return `Switch to ${LOCAL_ELECTION.chainName} before voting.`;
    }

    if (!electionState.votingOpen) {
      return "Voting is closed. Wait for admin to open voting.";
    }

    if (!isRegisteredVoter) {
      return "This wallet is viewer-only. Ask admin to register it as voter.";
    }

    return "";
  }

  const registerDisabledReason = useMemo(() => {
    if (isSubmittingAdminAction) {
      return "An admin transaction is already pending.";
    }

    if (!walletState.account) {
      return "Connect MetaMask to access admin actions.";
    }

    if (!isCorrectNetwork) {
      return `Switch to ${LOCAL_ELECTION.chainName} to use admin controls.`;
    }

    if (!isAdmin) {
      return "Admin only: switch to the deployer wallet.";
    }

    return "";
  }, [isAdmin, isCorrectNetwork, isSubmittingAdminAction, walletState.account]);

  const openVotingDisabledReason = useMemo(() => {
    if (registerDisabledReason) {
      return registerDisabledReason;
    }

    if (electionState.votingOpen) {
      return "Voting is already open.";
    }

    return "";
  }, [electionState.votingOpen, registerDisabledReason]);

  const closeVotingDisabledReason = useMemo(() => {
    if (registerDisabledReason) {
      return registerDisabledReason;
    }

    if (!electionState.votingOpen) {
      return "Voting is already closed.";
    }

    return "";
  }, [electionState.votingOpen, registerDisabledReason]);

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

  function handleCardDoubleClick(candidate, cardId, event) {
    const existingTimer = clickTimeoutsRef.current[cardId];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete clickTimeoutsRef.current[cardId];
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

  function renderCandidateCards(sectionKey) {
    const hasRealCandidates = hasLiveCandidates && !showCandidateUnavailable;
    const voteDisabledReason = hasRealCandidates
      ? getVoteDisabledReason()
      : "Preview mode. Deploy candidates to enable real voting.";

    const candidatesToRender = hasRealCandidates
      ? candidateMetrics.candidates
      : ["Candidate Alpha", "Candidate Beta", "Candidate Gamma"].map((name, index) => ({
          id: `sample-${index}`,
          index,
          name,
          voteCount: 0,
          rank: index + 1,
          voteShare: 0,
          isLeading: index === 0,
          profile: getFallbackProfile(index, name),
          isSample: true,
        }));

    return (
      <>
        {!hasRealCandidates && (
          <p className="helper-text">
            {showCandidateLoading
              ? "Loading candidate data from the deployed contract. Showing sample cards for layout preview."
              : showCandidateUnavailable
                ? "Candidate data is currently unavailable. Showing sample cards for layout preview."
                : "Showing sample candidate cards for layout preview."}
          </p>
        )}

        <div className="poll-list">
          {candidatesToRender.map((candidate) => {
            const cardId = `${sectionKey}-${candidate.id}`;
            const isFlipped = Boolean(flippedCards[cardId]);
            const isSample = Boolean(candidate.isSample);

            return (
              <article
                className={`poll-card interactive-card ${candidate.isLeading ? "poll-card-leading" : ""} ${
                  isSample ? "poll-card-sample" : ""
                } ${isFlipped ? "flipped" : ""}`}
                key={cardId}
                onClick={() => handleCardClick(cardId)}
                onDoubleClick={(event) => handleCardDoubleClick(candidate, cardId, event)}
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
                      <button
                        className="option-button"
                        disabled={Boolean(voteDisabledReason)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isSample) {
                            voteForCandidate(candidate.index);
                          }
                        }}
                        type="button"
                      >
                        <span>{isSample ? "Preview card" : `Vote for ${candidate.name}`}</span>
                        <strong>
                          {isSample ? "Preview only" : isSubmittingVote ? "Submitting..." : "Send transaction"}
                        </strong>
                      </button>
                      {voteDisabledReason && <p className="button-helper">{voteDisabledReason}</p>}
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
      </>
    );
  }
  function navigateTo(view) {
    const nextView = view === "admin" ? "admin" : "vote";
    if (nextView === currentView) {
      return;
    }

    const direction = nextView === "admin" ? "forward" : "backward";
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-route-dir", direction);
    }

    const nextHash = nextView === "admin" ? "#/admin" : "#/vote";
    const commitNavigation = () => {
      flushSync(() => {
        setCurrentView(nextView);
      });

      if (window.location.hash !== nextHash) {
        window.history.pushState(null, "", nextHash);
      }
    };

    if (supportsViewTransitions) {
      document.startViewTransition(commitNavigation);
      return;
    }

    commitNavigation();
  }
  const pageTitle = currentView === "admin" ? "Admin console for the election lifecycle." : "Wallet-first voter flow with live contract data.";
  const pageDescription =
    currentView === "admin"
      ? "Use the admin route to register voters and control election state without mixing those controls into the voter experience."
      : "Use the voter route to inspect candidates, connect a wallet, and cast one on-chain vote when voting is open.";
  const heroTitle =
    currentView === "admin" ? "Operate the election without polluting the ballot." : "Cast one wallet-backed vote from a clean ballot page.";
  const routeSummaryCards =
    currentView === "admin"
      ? [
          {
            label: "Lifecycle",
            value: electionState.votingOpen ? "Voting open" : "Voting closed",
            helper: "Open or close the election from the admin wallet only.",
          },
          {
            label: "Registered role",
            value: roleState.label,
            helper: "The contract still blocks non-admin wallets even on this page.",
          },
          {
            label: "Candidates",
            value: `${electionState.candidateCount}`,
            helper: "Results shown here are live reads from the deployed contract.",
          },
        ]
      : [
          {
            label: "Ballot status",
            value: electionState.votingOpen ? "Open now" : "Closed now",
            helper: electionState.votingOpen
              ? "Registered voters can submit exactly one vote."
              : "Wait for the admin to open the election before voting.",
          },
          {
            label: "Your role",
            value: roleState.label,
            helper: roleGuidance,
          },
          {
            label: "Candidates",
            value: `${electionState.candidateCount}`,
            helper: "Candidate names and vote totals come from the contract, not the frontend.",
          },
        ];

  return (
    <div
      ref={appShellRef}
      className={`app-shell bg-mode-${backgroundMode}`}
    >
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
          <span>Role</span>
          <strong>{roleState.label}</strong>
        </div>
        <div className="status-row">
          <span>Voting</span>
          <strong>{electionState.votingOpen ? "Open" : "Closed"}</strong>
        </div>

        <button className="primary-button context-connect" onClick={connectWallet} type="button">
          {walletState.account ? "Reconnect MetaMask" : "Connect MetaMask"}
        </button>
        <p className={`context-status ${status.type}`}>{status.message}</p>
      </aside>

      <div className="content-stage">
        <header ref={pageHeaderRef} className={`page-header ${!supportsViewTransitions ? `route-anim transition-${routeTransitionMode} ${isRouteAnimating ? `is-animating dir-${routeTransitionDirection}` : ""}` : ""}`}>
        <p className="eyebrow">Vox Election MVP</p>
        <h1>{heroTitle}</h1>
        <p className="hero-copy">{pageDescription}</p>
        <div className="route-switcher" role="tablist" aria-label="Application view">
          <button
            aria-selected={currentView === "vote"}
            className={`route-tab ${currentView === "vote" ? "active" : ""}`}
            onClick={() => navigateTo("vote")}
            type="button"
          >
            Voter view
          </button>
          <button
            aria-selected={currentView === "admin"}
            className={`route-tab ${currentView === "admin" ? "active" : ""}`}
            onClick={() => navigateTo("admin")}
            type="button"
          >
            Admin view
          </button>
        </div>
      </header>

      <main className={`page-flow ${!supportsViewTransitions ? `route-anim transition-${routeTransitionMode} ${isRouteAnimating ? `is-animating dir-${routeTransitionDirection}` : ""}` : ""}`}>
        <section className={`panel route-intro-panel route-intro-panel-${currentView}`}>
          <div className="route-intro-copy">
            <p className="panel-label">{currentView === "admin" ? "Admin workspace" : "Voter workspace"}</p>
            <h2>{pageTitle}</h2>
            <p className="helper-text">
              {currentView === "admin"
                ? "This page is optimized for registration and lifecycle changes. It reduces accidental clicks in demos, while the smart contract remains the real gatekeeper."
                : "This page keeps the voting flow focused: connect, verify status, inspect candidates, and submit one transaction when eligible."}
            </p>
          </div>
          <div className="route-summary-grid">
            {routeSummaryCards.map((card) => (
              <div className="route-summary-card" key={card.label}>
                <p className="panel-label">{card.label}</p>
                <strong>{card.value}</strong>
                <p>{card.helper}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel role-banner" aria-label="Wallet role and network status">
          <div className="role-banner-head">
            <p className="panel-label">{currentView === "admin" ? "Admin route status" : "Voter route status"}</p>
            <span className={`role-chip role-${roleState.key}`}>{roleState.label}</span>
          </div>
          <div className="role-banner-grid">
            <div>
              <p className="subsection-label">Wallet</p>
              <p>{walletState.account ? shortenAddress(walletState.account) : "Not connected"}</p>
              {previousAccount && walletState.account && previousAccount !== walletState.account && (
                <p className="helper-text">Previous wallet: {shortenAddress(previousAccount)}</p>
              )}
            </div>
            <div>
              <p className="subsection-label">Network</p>
              <p>{networkLabel}</p>
            </div>
            <div>
              <p className="subsection-label">{currentView === "admin" ? "Route guidance" : "Role resolution"}</p>
              <p>
                {currentView === "admin"
                  ? "Only the deployer wallet can use the admin controls below. Contract rules still enforce this on-chain."
                  : isResolvingRole
                    ? "Checking voter registration..."
                    : roleGuidance}
              </p>
            </div>
          </div>
        </section>

        {currentView === "vote" && (
          <section className="panel election-panel live-panel">
            <div className="live-subsection live-subsection-intro">
              <div className="panel-header">
                <div>
                  <p className="panel-label">Live election</p>
                  <h2>{electionState.electionName || "Loading election..."}</h2>
                </div>
                <div className="panel-header-meta">
                  <p className="panel-subtext">Real-time values are read directly from the deployed smart contract.</p>
                  <span className={`role-chip role-${roleState.key}`}>Current role: {roleState.label}</span>
                </div>
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

              {renderCandidateCards("live")}
              {renderStatusLine(actionStatus.vote)}
            </div>
          </section>
        )}

        {currentView === "admin" && (
          <section className="panel election-panel overview-panel">
            <div className="live-subsection live-subsection-intro">
              <div className="panel-header">
                <div>
                  <p className="panel-label">Admin overview</p>
                  <h2>{electionState.electionName || "Loading election..."}</h2>
                </div>
                <div className="panel-header-meta">
                  <p className="panel-subtext">
                    Candidate intelligence mirrored for admin context, with the same single-click flip and
                    double-click detailed profile behavior.
                  </p>
                  <span className={`role-chip role-${roleState.key}`}>Current role: {roleState.label}</span>
                </div>
              </div>
            </div>

            <div className="live-subsection live-subsection-meta">
              <p className="subsection-label">Admin overview metadata</p>
              <div className="poll-meta">
                <span>Admin: {electionState.admin ? shortenAddress(electionState.admin) : "Loading..."}</span>
                <span>Voting: {electionState.votingOpen ? "Open" : "Closed"}</span>
                <span>Total votes: {candidateMetrics.totalVotes}</span>
              </div>
            </div>

            <div className="live-subsection live-subsection-list">
              <div className="candidate-head">
                <p className="subsection-label">Candidate list</p>
                <span className={electionState.votingOpen ? "badge badge-live" : "badge"}>
                  {electionState.votingOpen ? "Voting is live" : "Voting is closed"}
                </span>
              </div>

              {renderCandidateCards("overview")}
            </div>
          </section>
        )}
        {currentView === "admin" ? (
          <section className="panel admin-panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Admin controls</p>
                <h2>Run the election lifecycle</h2>
              </div>
              <span className={`role-chip role-${roleState.key}`}>Current role: {roleState.label}</span>
            </div>

            <div className="admin-security-note">
              <p className="subsection-label">Important note</p>
              <p>
                This separate admin page improves workflow clarity, but the contract is still the real access
                control layer. Non-admin wallets remain blocked on-chain.
              </p>
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
                <button className="primary-button form-submit" disabled={Boolean(registerDisabledReason)} type="submit">
                  Register voter
                </button>
                {registerDisabledReason && <p className="button-helper">{registerDisabledReason}</p>}
              </form>
              {renderStatusLine(actionStatus.registerVoter)}
            </div>

            <div className="admin-section">
              <p className="subsection-label">Admin actions</p>
              <div className="admin-action-row">
                <div>
                  <button
                    className="secondary-button"
                    disabled={Boolean(openVotingDisabledReason)}
                    onClick={openVotingFromUi}
                    type="button"
                  >
                    Open voting
                  </button>
                  {openVotingDisabledReason && <p className="button-helper">{openVotingDisabledReason}</p>}
                  {renderStatusLine(actionStatus.openVoting, "inline-compact")}
                </div>

                <div>
                  <button
                    className="secondary-button"
                    disabled={Boolean(closeVotingDisabledReason)}
                    onClick={closeVotingFromUi}
                    type="button"
                  >
                    Close voting
                  </button>
                  {closeVotingDisabledReason && <p className="button-helper">{closeVotingDisabledReason}</p>}
                  {renderStatusLine(actionStatus.closeVoting, "inline-compact")}
                </div>
              </div>
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
        ) : (
          <section className="panel voter-route-panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Voter route</p>
                <h2>Cast one on-chain vote</h2>
              </div>
              <span className={`role-chip role-${roleState.key}`}>Current role: {roleState.label}</span>
            </div>

            <div className="voter-route-grid">
              <div className="voter-route-card">
                <p className="subsection-label">Ballot rules</p>
                <p className="helper-text">
                  Registered wallets can submit one vote while the election is open. The contract prevents double
                  voting and rejects unregistered wallets.
                </p>
              </div>
              <div className="voter-route-card">
                <p className="subsection-label">Before you vote</p>
                <p className="helper-text">
                  {electionState.votingOpen
                    ? "Voting is currently open for registered wallets."
                    : "Voting is currently closed until the admin opens it."}
                </p>
                <p className="helper-text">
                  Use the candidate cards above to inspect profiles, then send one transaction from your registered
                  wallet.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
      </div>

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






















