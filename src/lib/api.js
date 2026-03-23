const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export async function verifyIdentity({ aadhaarId, fullName, dateOfBirth, walletAddress }) {
  const res = await fetch(`${API_BASE}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aadhaarId, fullName, dateOfBirth, walletAddress }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Verification failed");
  return data;
}

// --- Admin API helpers ---

let _cachedAdminHeaders = null;
let _cachedHeadersExpiry = 0;

export async function getAdminHeaders(signer) {
  const now = Date.now();
  if (_cachedAdminHeaders && now < _cachedHeadersExpiry) {
    return _cachedAdminHeaders;
  }
  const message = `vox-admin-${now}`;
  const signature = await signer.signMessage(message);
  _cachedAdminHeaders = {
    "Content-Type": "application/json",
    "x-admin-signature": signature,
    "x-admin-message": message,
  };
  _cachedHeadersExpiry = now + 4 * 60 * 1000; // reuse for 4 minutes
  return _cachedAdminHeaders;
}

export async function adminGetCitizens(signer) {
  const headers = await getAdminHeaders(signer);
  const res = await fetch(`${API_BASE}/api/admin/citizens`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch citizens");
  return data;
}

export async function adminAddCitizen(signer, citizen) {
  const headers = await getAdminHeaders(signer);
  const res = await fetch(`${API_BASE}/api/admin/citizens`, {
    method: "POST",
    headers,
    body: JSON.stringify(citizen),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to add citizen");
  return data;
}

export async function adminDeleteCitizen(signer, aadhaarId) {
  const headers = await getAdminHeaders(signer);
  const res = await fetch(`${API_BASE}/api/admin/citizens/${aadhaarId}`, {
    method: "DELETE",
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to delete citizen");
  return data;
}

export async function adminGetAdmins(signer) {
  const headers = await getAdminHeaders(signer);
  const res = await fetch(`${API_BASE}/api/admin/admins`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch admins");
  return data;
}

export async function adminAppointAdmin(signer, { walletAddress, label }) {
  const headers = await getAdminHeaders(signer);
  const res = await fetch(`${API_BASE}/api/admin/admins`, {
    method: "POST",
    headers,
    body: JSON.stringify({ walletAddress, label }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to appoint admin");
  return data;
}

export async function adminRemoveAdmin(signer, walletAddress) {
  const headers = await getAdminHeaders(signer);
  const res = await fetch(`${API_BASE}/api/admin/admins/${walletAddress}`, {
    method: "DELETE",
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to remove admin");
  return data;
}

// --- Public endpoints ---

export async function checkAdminStatus(walletAddress) {
  const res = await fetch(`${API_BASE}/api/admin/check/${walletAddress}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to check admin status");
  return data;
}

export async function getLatestElection(network) {
  const res = await fetch(`${API_BASE}/api/elections/latest?network=${network}`);
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch latest election");
  return data;
}

// --- Election management ---

export async function adminCreateElection(signer, { electionName, candidates }) {
  const headers = await getAdminHeaders(signer);
  const res = await fetch(`${API_BASE}/api/admin/elections`, {
    method: "POST",
    headers,
    body: JSON.stringify({ electionName, candidates }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to create election");
  return data;
}
