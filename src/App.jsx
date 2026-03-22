import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import { ELECTION_NETWORKS, DEFAULT_NETWORK_KEY, getConfigForNetwork, getReadOnlyElectionContract } from "./lib/election";
import {
  verifyIdentity,
  adminAddCitizen,
  adminGetCitizens,
  adminAppointAdmin,
  adminGetAdmins,
  adminRemoveAdmin,
  checkAdminStatus,
  getLatestElection,
  adminCreateElection,
} from "./lib/api";

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
  const [currentView, setCurrentView] = useState(getCurrentView);
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
  const [verifyForm, setVerifyForm] = useState({
    aadhaarId: "",
    fullName: "",
    dateOfBirth: "",
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState(null);
  const [citizenForm, setCitizenForm] = useState({
    aadhaarId: "",
    fullName: "",
    dateOfBirth: "",
    gender: "Male",
    district: "",
  });
  const [citizenFormStatus, setCitizenFormStatus] = useState(null);
  const [isCitizenSubmitting, setIsCitizenSubmitting] = useState(false);
  const [appointForm, setAppointForm] = useState({ walletAddress: "", label: "" });
  const [appointFormStatus, setAppointFormStatus] = useState(null);
  const [isAppointSubmitting, setIsAppointSubmitting] = useState(false);
  const [citizenList, setCitizenList] = useState([]);
  const [adminList, setAdminList] = useState([]);
  const [deployerAddress, setDeployerAddress] = useState("");
  const [isLoadingAdminData, setIsLoadingAdminData] = useState(false);
  const [activeNetwork, setActiveNetwork] = useState(DEFAULT_NETWORK_KEY);
  const [contractAddressOverride, setContractAddressOverride] = useState("");
  const [backendAdminStatus, setBackendAdminStatus] = useState({ isAdmin: false, isDeployer: false });
  const [electionForm, setElectionForm] = useState({ electionName: "", candidates: ["", ""] });
  const [electionFormStatus, setElectionFormStatus] = useState(null);
  const [isCreatingElection, setIsCreatingElection] = useState(false);
  const [flippedCards, setFlippedCards] = useState({});
  const [activeCandidateDetails, setActiveCandidateDetails] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailMotion, setDetailMotion] = useState({ dx: 0, dy: 0, sx: 1, sy: 1 });
  const clickTimeoutsRef = useRef({});
  const closeDetailTimeoutRef = useRef(null);

  const electionConfig = useMemo(
    () => getConfigForNetwork(activeNetwork, contractAddressOverride),
    [activeNetwork, contractAddressOverride],
  );
  const isCorrectNetwork = walletState.chainId === electionConfig.chainId;
  const isAdmin = backendAdminStatus.isAdmin || backendAdminStatus.isDeployer;
  const isDeployer = backendAdminStatus.isDeployer;
  const isAdminRouteLocked = !walletState.account || !isCorrectNetwork || !isAdmin;
  const targetChainIdHex = ethers.toBeHex(electionConfig.chainId);

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

  // Auto-route based on role: admin goes to admin view, everyone else to voter view
  useEffect(() => {
    if (roleState.key === "admin") {
      navigateTo("admin");
    } else if (roleState.key === "voter" || roleState.key === "viewer") {
      navigateTo("vote");
    }
  }, [roleState.key]);

  const roleGuidance = useMemo(() => {
    if (roleState.key === "disconnected") {
      return "Connect MetaMask to unlock voting and admin actions.";
    }

    if (roleState.key === "wrong_network") {
      return `Switch MetaMask to ${electionConfig.chainName} to continue testing.`;
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
      return electionConfig.chainName;
    }

    return `Chain ${walletState.chainId} (expected ${electionConfig.chainId})`;
  }, [isCorrectNetwork, walletState.chainId]);

  const updateActionStatus = useCallback((actionKey, feedback) => {
    setActionStatus((current) => ({
      ...current,
      [actionKey]: feedback,
    }));
  }, []);

  const refreshVoterRole = useCallback(async (account, chainId) => {
    if (!account || chainId !== electionConfig.chainId) {
      setIsRegisteredVoter(false);
      setIsResolvingRole(false);
      return;
    }

    try {
      setIsResolvingRole(true);
      const contract = getReadOnlyElectionContract(electionConfig);
      const registered = await contract.isRegisteredVoter(account);
      setIsRegisteredVoter(Boolean(registered));
    } catch {
      setIsRegisteredVoter(false);
    } finally {
      setIsResolvingRole(false);
    }
  }, [electionConfig]);

  const refreshElectionState = useCallback(async () => {
    setIsLoading(true);

    try {
      const contract = getReadOnlyElectionContract(electionConfig);
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
            `Could not read the ${electionConfig.chainName} contract. Check the RPC, contract address, and deployment status.`,
          ),
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [electionConfig]);

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

      if (nextChainId !== electionConfig.chainId) {
        setStatus(
          makeStatus(
            "error",
            "error",
            "network",
            `Wrong network detected. Switch to ${electionConfig.chainName} (${electionConfig.chainId}).`,
          ),
        );
      } else {
        setStatus(
          makeStatus(
            "success",
            "idle",
            "network",
            `${electionConfig.chainName} selected. Actions are available for your current role.`,
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
    };
  }, []);

  useEffect(() => {
    refreshVoterRole(walletState.account, walletState.chainId);
  }, [refreshVoterRole, walletState.account, walletState.chainId, electionState.admin]);

  // Check backend admin status when wallet changes
  useEffect(() => {
    if (!walletState.account) {
      setBackendAdminStatus({ isAdmin: false, isDeployer: false });
      return;
    }
    checkAdminStatus(walletState.account)
      .then(setBackendAdminStatus)
      .catch(() => setBackendAdminStatus({ isAdmin: false, isDeployer: false }));
  }, [walletState.account]);

  // Fetch latest election from backend on mount and network change
  useEffect(() => {
    getLatestElection(activeNetwork)
      .then((data) => {
        if (data && data.contractAddress) {
          setContractAddressOverride(data.contractAddress);
        }
      })
      .catch(() => {});
  }, [activeNetwork]);

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
      electionConfig.contractAddress,
      getReadOnlyElectionContract(electionConfig).interface,
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
      return `Switch MetaMask to ${electionConfig.chainName} before continuing.`;
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
          `Requesting ${electionConfig.chainName} in MetaMask before connecting wallet...`,
        ),
      );

      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainIdHex }],
      });
    } catch (error) {
      if (error.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: targetChainIdHex,
              chainName: electionConfig.chainName,
              rpcUrls: [electionConfig.rpcUrl],
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
            normalizeError(error, `Could not switch MetaMask to ${electionConfig.chainName}.`),
          ),
        );
        return;
      }
    }

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setWalletState({
        account: accounts[0] || "",
        chainId: electionConfig.chainId,
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

  function disconnectWallet() {
    setWalletState({ account: "", chainId: null });
    setPreviousAccount("");
    setIsRegisteredVoter(false);
    setStatus(makeStatus("info", "idle", "init", "Wallet disconnected."));
    navigateTo("vote");
  }

  async function submitVerification(event) {
    event.preventDefault();
    if (isVerifying) return;

    setIsVerifying(true);
    setVerifyStatus(null);

    try {
      const result = await verifyIdentity({
        aadhaarId: verifyForm.aadhaarId.trim(),
        fullName: verifyForm.fullName.trim(),
        dateOfBirth: verifyForm.dateOfBirth,
        walletAddress: walletState.account,
      });

      setVerifyStatus({ type: "success", message: result.message, txHash: result.txHash });
      await refreshVoterRole(walletState.account, walletState.chainId);
    } catch (err) {
      setVerifyStatus({ type: "error", message: err.message });
    } finally {
      setIsVerifying(false);
    }
  }

  async function getMetaMaskSigner() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    return provider.getSigner();
  }

  async function loadAdminData() {
    if (isLoadingAdminData) return;
    setIsLoadingAdminData(true);
    try {
      const signer = await getMetaMaskSigner();
      const [citizenData, adminData] = await Promise.all([
        adminGetCitizens(signer),
        adminGetAdmins(signer),
      ]);
      setCitizenList(citizenData.citizens);
      setAdminList(adminData.admins);
      setDeployerAddress(adminData.deployerAddress);
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setIsLoadingAdminData(false);
    }
  }

  async function submitAddCitizen(event) {
    event.preventDefault();
    if (isCitizenSubmitting) return;
    setIsCitizenSubmitting(true);
    setCitizenFormStatus(null);
    try {
      const signer = await getMetaMaskSigner();
      const result = await adminAddCitizen(signer, {
        aadhaarId: citizenForm.aadhaarId.trim(),
        fullName: citizenForm.fullName.trim(),
        dateOfBirth: citizenForm.dateOfBirth,
        gender: citizenForm.gender,
        district: citizenForm.district.trim(),
      });
      setCitizenFormStatus({ type: "success", message: result.message });
      setCitizenForm({ aadhaarId: "", fullName: "", dateOfBirth: "", gender: "Male", district: "" });
      await loadAdminData();
    } catch (err) {
      setCitizenFormStatus({ type: "error", message: err.message });
    } finally {
      setIsCitizenSubmitting(false);
    }
  }

  async function submitAppointAdmin(event) {
    event.preventDefault();
    if (isAppointSubmitting) return;
    setIsAppointSubmitting(true);
    setAppointFormStatus(null);
    try {
      const signer = await getMetaMaskSigner();
      const result = await adminAppointAdmin(signer, {
        walletAddress: appointForm.walletAddress.trim(),
        label: appointForm.label.trim(),
      });
      setAppointFormStatus({ type: "success", message: result.message });
      setAppointForm({ walletAddress: "", label: "" });
      await loadAdminData();
    } catch (err) {
      setAppointFormStatus({ type: "error", message: err.message });
    } finally {
      setIsAppointSubmitting(false);
    }
  }

  async function handleRemoveAdmin(walletAddress) {
    try {
      const signer = await getMetaMaskSigner();
      await adminRemoveAdmin(signer, walletAddress);
      await loadAdminData();
    } catch (err) {
      setAppointFormStatus({ type: "error", message: err.message });
    }
  }

  async function handleNetworkSwitch(event) {
    const networkKey = event.target.value;
    setActiveNetwork(networkKey);
    setContractAddressOverride("");

    if (window.ethereum && walletState.account) {
      const config = getConfigForNetwork(networkKey);
      const chainIdHex = ethers.toBeHex(config.chainId);
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: chainIdHex,
                chainName: config.chainName,
                rpcUrls: [config.rpcUrl],
                nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
              }],
            });
          } catch {
            // user rejected adding chain
          }
        }
      }
    }
  }

  async function submitCreateElection(event) {
    event.preventDefault();
    if (isCreatingElection) return;
    setIsCreatingElection(true);
    setElectionFormStatus(null);
    try {
      const signer = await getMetaMaskSigner();
      const cleanCandidates = electionForm.candidates.map((c) => c.trim()).filter(Boolean);
      if (cleanCandidates.length === 0) {
        setElectionFormStatus({ type: "error", message: "At least one candidate is required" });
        return;
      }
      const result = await adminCreateElection(signer, {
        electionName: electionForm.electionName.trim(),
        candidates: cleanCandidates,
      });
      setElectionFormStatus({ type: "success", message: result.message });
      setContractAddressOverride(result.contractAddress);
      setElectionForm({ electionName: "", candidates: ["", ""] });
    } catch (err) {
      setElectionFormStatus({ type: "error", message: err.message });
    } finally {
      setIsCreatingElection(false);
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
  const showCandidateEmpty = !isLoading && Boolean(electionState.electionName) && !hasLiveCandidates;

  function getVoteDisabledReason() {
    if (isSubmittingVote) {
      return "A vote transaction is already pending.";
    }

    if (!walletState.account) {
      return "Connect MetaMask to vote.";
    }

    if (!isCorrectNetwork) {
      return `Switch to ${electionConfig.chainName} before voting.`;
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
      return `Switch to ${electionConfig.chainName} to use admin controls.`;
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

  function navigateTo(view) {
    window.location.hash = view === "admin" ? "/admin" : "/vote";
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
    <div className="app-shell">
      <div className="background-grid" />

      {roleState.key !== "disconnected" && roleState.key !== "wrong_network" && (
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
      )}

      {roleState.key !== "disconnected" && roleState.key !== "wrong_network" && (
      <>
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
          <strong>{electionConfig.chainName}</strong>
        </div>
        <div className="status-row">
          <span>Contract</span>
          <strong>{electionConfig.contractAddress ? shortenAddress(electionConfig.contractAddress) : "Not set"}</strong>
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
      </>
      )}

      {roleState.key === "disconnected" ? (
        <div className="landing-page">
          <div className="landing-content">
            <select className="network-switcher" value={activeNetwork} onChange={handleNetworkSwitch}>
              {Object.entries(ELECTION_NETWORKS).map(([key, net]) => (
                <option key={key} value={key}>{net.chainName}</option>
              ))}
            </select>
            <p className="eyebrow">Vox</p>
            <h1>Cast one wallet-backed vote from a clean ballot page.</h1>
            <button className="primary-button landing-connect" onClick={connectWallet} type="button">
              Connect MetaMask
            </button>
            {status.type === "error" && (
              <p className="landing-error">{status.message}</p>
            )}
          </div>
        </div>
      ) : roleState.key === "wrong_network" ? (
        <div className="landing-page">
          <div className="landing-content">
            <select className="network-switcher" value={activeNetwork} onChange={handleNetworkSwitch}>
              {Object.entries(ELECTION_NETWORKS).map(([key, net]) => (
                <option key={key} value={key}>{net.chainName}</option>
              ))}
            </select>
            <p className="eyebrow">Vox</p>
            <h1>Wrong Network</h1>
            <p className="landing-subtitle">Please switch MetaMask to {electionConfig.chainName} to continue</p>
            <button className="primary-button landing-connect" onClick={connectWallet} type="button">
              Switch to {electionConfig.chainName}
            </button>
          </div>
        </div>
      ) : (
      <>
      <header className="page-header">
        <div className="header-top-row">
          <select className="network-switcher" value={activeNetwork} onChange={handleNetworkSwitch}>
            {Object.entries(ELECTION_NETWORKS).map(([key, net]) => (
              <option key={key} value={key}>{net.chainName}</option>
            ))}
          </select>
          <button className="logout-button" onClick={disconnectWallet} type="button">
            Log out
          </button>
        </div>
        <p className="eyebrow">Vox</p>
        <h1>{heroTitle}</h1>
        <p className="hero-copy">{pageDescription}</p>
      </header>

      <main className="page-flow">
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

        {currentView !== "admin" && roleState.key === "viewer" && (
          <section className="panel verify-panel" aria-label="Identity verification">
            <div className="panel-header">
              <div>
                <p className="panel-label">DigiLocker verification</p>
                <h2>Verify your identity to register as a voter</h2>
              </div>
            </div>
            <p className="panel-subtext" style={{ marginBottom: "1rem" }}>
              Enter your Aadhaar details below to verify your identity. Once verified, your connected wallet will be
              registered as a voter on-chain automatically.
            </p>
            <form onSubmit={submitVerification} className="verify-form">
              <div className="form-field">
                <label htmlFor="aadhaar-id">Aadhaar ID (12 digits)</label>
                <input
                  id="aadhaar-id"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{12}"
                  maxLength={12}
                  placeholder="e.g. 234567890123"
                  value={verifyForm.aadhaarId}
                  onChange={(e) => setVerifyForm((f) => ({ ...f, aadhaarId: e.target.value }))}
                  required
                  disabled={isVerifying}
                />
              </div>
              <div className="form-field">
                <label htmlFor="full-name">Full Name</label>
                <input
                  id="full-name"
                  type="text"
                  placeholder="e.g. Priya Sharma"
                  value={verifyForm.fullName}
                  onChange={(e) => setVerifyForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                  disabled={isVerifying}
                />
              </div>
              <div className="form-field">
                <label htmlFor="dob">Date of Birth</label>
                <input
                  id="dob"
                  type="date"
                  value={verifyForm.dateOfBirth}
                  onChange={(e) => setVerifyForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  required
                  disabled={isVerifying}
                />
              </div>
              <div className="form-field">
                <label>Wallet Address</label>
                <input type="text" value={walletState.account || ""} disabled readOnly />
              </div>
              <button type="submit" className="action-btn primary" disabled={isVerifying}>
                {isVerifying ? "Verifying..." : "Verify & Register"}
              </button>
            </form>
            {verifyStatus && (
              <div className={`verify-feedback verify-${verifyStatus.type}`} style={{ marginTop: "1rem" }}>
                <p>{verifyStatus.message}</p>
                {verifyStatus.txHash && (
                  <p className="helper-text">
                    Tx: <a href={`https://sepolia.etherscan.io/tx/${verifyStatus.txHash}`} target="_blank" rel="noopener noreferrer">{verifyStatus.txHash.slice(0, 16)}...</a>
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <section className="panel live-panel">
          <div className="live-subsection live-subsection-intro">
            <div className="panel-header">
              <div>
                <p className="panel-label">{currentView === "admin" ? "Admin overview" : "Live election"}</p>
                <h2>{electionState.electionName || "Loading election..."}</h2>
              </div>
              <div className="panel-header-meta">
                <p className="panel-subtext">
                  {currentView === "admin"
                    ? "Admin controls are separated in this route, but the smart contract remains the real authority."
                    : "Real-time values are read directly from the deployed smart contract."}
                </p>
                <span className={`role-chip role-${roleState.key}`}>Current role: {roleState.label}</span>
              </div>
            </div>
          </div>

          <div className="live-subsection live-subsection-meta">
            <p className="subsection-label">Election overview metadata</p>
            <div className="poll-meta">
              <span>Candidates: {electionState.candidateCount}</span>
              <span>Total votes: {candidateMetrics.totalVotes}</span>
              <span>Chain ID: {electionConfig.chainId}</span>
            </div>
          </div>

          <div className="live-subsection live-subsection-list">
            <div className="candidate-head">
              <p className="subsection-label">Candidate list</p>
              <span className={electionState.votingOpen ? "badge badge-live" : "badge"}>
                {electionState.votingOpen ? "Voting is live" : "Voting is closed"}
              </span>
            </div>

            {showCandidateLoading && (
              <p className="helper-text">Loading candidate data from the deployed contract...</p>
            )}
            {showCandidateUnavailable && (
              <p className="helper-text">
                Candidate data is unavailable. Make sure the Hardhat node is running, the contract is
                deployed, and the frontend address matches the latest deployment.
              </p>
            )}
            {showCandidateEmpty && (
              <p className="helper-text">No candidates were returned by the current contract deployment.</p>
            )}

            {!showCandidateLoading && hasLiveCandidates && (
              <div className="poll-list">
                {candidateMetrics.candidates.map((candidate) => {
                const isFlipped = Boolean(flippedCards[candidate.id]);
                const voteDisabledReason = getVoteDisabledReason();

                return (
                  <article
                    className={`poll-card interactive-card ${candidate.isLeading ? "poll-card-leading" : ""} ${
                      isFlipped ? "flipped" : ""
                    }`}
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
                          <button
                            className="option-button"
                            disabled={Boolean(voteDisabledReason)}
                            onClick={(event) => {
                              event.stopPropagation();
                              voteForCandidate(candidate.index);
                            }}
                            type="button"
                          >
                            <span>Vote for {candidate.name}</span>
                            <strong>{isSubmittingVote ? "Submitting..." : "Send transaction"}</strong>
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
            )}
            {renderStatusLine(actionStatus.vote)}
          </div>
        </section>

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

            {isAdminRouteLocked ? (
              <div className="admin-locked-state">
                <p className="subsection-label">Admin access required</p>
                <p className="helper-text">
                  {!walletState.account
                    ? "Connect MetaMask with an admin wallet to unlock controls."
                    : !isCorrectNetwork
                      ? `Switch MetaMask to ${electionConfig.chainName}, then reconnect with an admin wallet.`
                      : "This wallet is not authorized as an admin."}
                </p>
                {!walletState.account && (
                  <button className="primary-button" onClick={connectWallet} type="button">
                    Connect admin wallet
                  </button>
                )}
              </div>
            ) : (
              <>
                {isDeployer && (
                  <div className="admin-section">
                    <p className="subsection-label">Create new election</p>
                    <form className="poll-form" onSubmit={submitCreateElection}>
                      <label>
                        Election name
                        <input
                          type="text"
                          placeholder="e.g. Student Council Election 2026"
                          value={electionForm.electionName}
                          onChange={(e) => setElectionForm((f) => ({ ...f, electionName: e.target.value }))}
                          required
                          disabled={isCreatingElection}
                        />
                      </label>
                      <p className="subsection-label" style={{ marginTop: "8px" }}>Candidates</p>
                      {electionForm.candidates.map((candidate, idx) => (
                        <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="text"
                            placeholder={`Candidate ${idx + 1}`}
                            value={candidate}
                            onChange={(e) => {
                              const updated = [...electionForm.candidates];
                              updated[idx] = e.target.value;
                              setElectionForm((f) => ({ ...f, candidates: updated }));
                            }}
                            disabled={isCreatingElection}
                            style={{ flex: 1 }}
                          />
                          {electionForm.candidates.length > 1 && (
                            <button
                              type="button"
                              className="secondary-button"
                              style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                              onClick={() => {
                                const updated = electionForm.candidates.filter((_, i) => i !== idx);
                                setElectionForm((f) => ({ ...f, candidates: updated }));
                              }}
                              disabled={isCreatingElection}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setElectionForm((f) => ({ ...f, candidates: [...f.candidates, ""] }))}
                        disabled={isCreatingElection}
                        style={{ marginTop: "4px" }}
                      >
                        + Add candidate
                      </button>
                      <button className="primary-button form-submit" disabled={isCreatingElection} type="submit">
                        {isCreatingElection ? "Deploying to Sepolia..." : "Deploy election"}
                      </button>
                    </form>
                    {electionFormStatus && (
                      <div className={`verify-feedback verify-${electionFormStatus.type}`} style={{ marginTop: "8px" }}>
                        <p>{electionFormStatus.message}</p>
                      </div>
                    )}
                  </div>
                )}

                {isDeployer && (
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
                      <p className="helper-text">Use a valid wallet address on the active {electionConfig.chainName} network.</p>
                      <button className="primary-button form-submit" disabled={Boolean(registerDisabledReason)} type="submit">
                        Register voter
                      </button>
                      {registerDisabledReason && <p className="button-helper">{registerDisabledReason}</p>}
                    </form>
                    {renderStatusLine(actionStatus.registerVoter)}
                  </div>
                )}

                {isDeployer && (
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
                )}

                <div className="admin-section">
                  <div className="admin-section-head">
                    <p className="subsection-label">DigiLocker management</p>
                    <button
                      className="secondary-button"
                      onClick={loadAdminData}
                      disabled={isLoadingAdminData}
                      type="button"
                    >
                      {isLoadingAdminData ? "Loading..." : "Load data"}
                    </button>
                  </div>

                  <form className="poll-form" onSubmit={submitAddCitizen}>
                    <p className="helper-text" style={{ marginBottom: "4px" }}>Add a citizen to the DigiLocker database</p>
                    <label>
                      Aadhaar ID (12 digits)
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="\d{12}"
                        maxLength={12}
                        placeholder="e.g. 234567890123"
                        value={citizenForm.aadhaarId}
                        onChange={(e) => setCitizenForm((f) => ({ ...f, aadhaarId: e.target.value }))}
                        required
                        disabled={isCitizenSubmitting}
                      />
                    </label>
                    <label>
                      Full Name
                      <input
                        type="text"
                        placeholder="e.g. Priya Sharma"
                        value={citizenForm.fullName}
                        onChange={(e) => setCitizenForm((f) => ({ ...f, fullName: e.target.value }))}
                        required
                        disabled={isCitizenSubmitting}
                      />
                    </label>
                    <label>
                      Date of Birth
                      <input
                        type="date"
                        value={citizenForm.dateOfBirth}
                        onChange={(e) => setCitizenForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                        required
                        disabled={isCitizenSubmitting}
                      />
                    </label>
                    <label>
                      Gender
                      <select
                        value={citizenForm.gender}
                        onChange={(e) => setCitizenForm((f) => ({ ...f, gender: e.target.value }))}
                        disabled={isCitizenSubmitting}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                    <label>
                      District
                      <input
                        type="text"
                        placeholder="e.g. Central Delhi"
                        value={citizenForm.district}
                        onChange={(e) => setCitizenForm((f) => ({ ...f, district: e.target.value }))}
                        required
                        disabled={isCitizenSubmitting}
                      />
                    </label>
                    <button className="primary-button form-submit" disabled={isCitizenSubmitting} type="submit">
                      {isCitizenSubmitting ? "Adding..." : "Add citizen"}
                    </button>
                  </form>
                  {citizenFormStatus && (
                    <div className={`verify-feedback verify-${citizenFormStatus.type}`} style={{ marginTop: "8px" }}>
                      <p>{citizenFormStatus.message}</p>
                    </div>
                  )}

                  {citizenList.length > 0 && (
                    <div className="admin-data-table" style={{ marginTop: "12px" }}>
                      <p className="helper-text">{citizenList.length} citizens in database</p>
                      <div className="data-table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Aadhaar</th>
                              <th>Name</th>
                              <th>DOB</th>
                              <th>District</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {citizenList.map((c) => (
                              <tr key={c.aadhaar_id}>
                                <td>{c.aadhaar_id}</td>
                                <td>{c.full_name}</td>
                                <td>{c.date_of_birth}</td>
                                <td>{c.district}</td>
                                <td>{c.registered_wallet ? "Verified" : "Pending"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {isDeployer && (
                <div className="admin-section">
                  <p className="subsection-label">Admin management</p>
                  <form className="poll-form" onSubmit={submitAppointAdmin}>
                    <p className="helper-text" style={{ marginBottom: "4px" }}>Appoint a wallet as admin (deployer only)</p>
                    <label>
                      Wallet address
                      <input
                        type="text"
                        placeholder="0x..."
                        value={appointForm.walletAddress}
                        onChange={(e) => setAppointForm((f) => ({ ...f, walletAddress: e.target.value }))}
                        required
                        disabled={isAppointSubmitting}
                      />
                    </label>
                    <label>
                      Label (optional)
                      <input
                        type="text"
                        placeholder="e.g. Co-admin, Election Officer"
                        value={appointForm.label}
                        onChange={(e) => setAppointForm((f) => ({ ...f, label: e.target.value }))}
                        disabled={isAppointSubmitting}
                      />
                    </label>
                    <button className="primary-button form-submit" disabled={isAppointSubmitting} type="submit">
                      {isAppointSubmitting ? "Appointing..." : "Appoint admin"}
                    </button>
                  </form>
                  {appointFormStatus && (
                    <div className={`verify-feedback verify-${appointFormStatus.type}`} style={{ marginTop: "8px" }}>
                      <p>{appointFormStatus.message}</p>
                    </div>
                  )}

                  {(adminList.length > 0 || deployerAddress) && (
                    <div className="admin-data-table" style={{ marginTop: "12px" }}>
                      <p className="helper-text">Current admins</p>
                      <div className="data-table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Wallet</th>
                              <th>Label</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deployerAddress && (
                              <tr>
                                <td title={deployerAddress}>{deployerAddress.slice(0, 8)}...{deployerAddress.slice(-6)}</td>
                                <td>Deployer (permanent)</td>
                                <td></td>
                              </tr>
                            )}
                            {adminList.map((a) => (
                              <tr key={a.wallet_address}>
                                <td title={a.wallet_address}>{a.wallet_address.slice(0, 8)}...{a.wallet_address.slice(-6)}</td>
                                <td>{a.label || "Admin"}</td>
                                <td>
                                  <button
                                    className="secondary-button"
                                    onClick={() => handleRemoveAdmin(a.wallet_address)}
                                    type="button"
                                    style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                )}
              </>
            )}

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
      </>
      )}
    </div>
  );
}

export default App;
