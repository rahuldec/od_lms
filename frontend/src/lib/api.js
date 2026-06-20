import axios from "axios";
import { supabase } from "@/lib/supabaseClient";
const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

// --- Single-flight refresh lock ---------------------------------------
// Supabase refresh tokens are single-use/rotating. If multiple API calls
// fire in parallel (e.g. an admin dashboard loading me() + listTrainees()
// + listBatches() at once) and each one independently calls
// supabase.auth.refreshSession(), only the first call actually succeeds -
// every other concurrent call gets back a 400 invalid_grant because the
// refresh token it was holding has already been rotated out from under it.
// That failure then looked like "the user's session is dead" and triggered
// a sign-out, even though the session was perfectly fine.
//
// Fix: never call refreshSession() directly. Always go through this
// helper, which guarantees that no matter how many callers ask for a
// refresh at the same time, only ONE actual network call happens. Every
// other caller just awaits that same in-flight promise and gets the
// same result.
let refreshPromise = null;
const refreshSessionOnce = () => {
  if (!refreshPromise) {
    refreshPromise = supabase.auth
      .refreshSession()
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// If the access token is missing or expires within the next 60s, proactively
// refresh it instead of handing the backend a token that's about to (or already)
// stopped working. This covers the common case where a tab has been idle/backgrounded
// and Supabase's background auto-refresh timer didn't get to run.
const getFreshSession = async () => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const expiresAtMs = (session.expires_at || 0) * 1000;
  const isExpiringSoon = expiresAtMs - Date.now() < 60 * 1000;

  if (isExpiringSoon) {
    const { data: refreshed, error } = await refreshSessionOnce();
    if (!error && refreshed.session) return refreshed.session;
    // Refresh failed (e.g. refresh token also invalid) - fall back to whatever we had.
    return session;
  }
  return session;
};

const authHeader = async () => {
  const session = await getFreshSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Wraps an axios call so that a single 401 triggers exactly one forced session
// refresh + retry before giving up. This protects against the rare case where
// getSession() handed back a token the backend has already rejected (e.g. it was
// revoked, or expires_at was slightly out of sync with the server's clock).
const withAuthRetry = async (makeRequest) => {
  try {
    return await makeRequest(await authHeader());
  } catch (err) {
    if (err?.response?.status === 401) {
      const { data: refreshed } = await refreshSessionOnce();
      const token = refreshed?.session?.access_token;
      if (token) {
        return await makeRequest({ Authorization: `Bearer ${token}` });
      }
    }
    throw err;
  }
};

export const api = {
  setupInit: () => axios.post(`${BASE}/setup/init`).then((r) => r.data),
  me: () =>
    withAuthRetry((headers) =>
      axios.get(`${BASE}/me`, { headers }).then((r) => r.data)
    ),
  listTrainees: () =>
    withAuthRetry((headers) =>
      axios.get(`${BASE}/admin/trainees`, { headers }).then((r) => r.data)
    ),
  getTrainee: (id) =>
    withAuthRetry((headers) =>
      axios.get(`${BASE}/admin/trainees/${id}`, { headers }).then((r) => r.data)
    ),
  createTrainee: (body) =>
    withAuthRetry((headers) =>
      axios.post(`${BASE}/admin/trainees`, body, { headers }).then((r) => r.data)
    ),
  updateTrainee: (id, body) =>
    withAuthRetry((headers) =>
      axios.put(`${BASE}/admin/trainees/${id}`, body, { headers }).then((r) => r.data)
    ),
  deleteTrainee: (id) =>
    withAuthRetry((headers) =>
      axios.delete(`${BASE}/admin/trainees/${id}`, { headers }).then((r) => r.data)
    ),
  promoteTrainee: (id) =>
    withAuthRetry((headers) =>
      axios
        .post(`${BASE}/admin/trainees/${id}/promote`, {}, { headers })
        .then((r) => r.data)
    ),
  listBatches: () =>
    withAuthRetry((headers) =>
      axios.get(`${BASE}/admin/batches`, { headers }).then((r) => r.data)
    ),
  getBatch: (id) =>
    withAuthRetry((headers) =>
      axios.get(`${BASE}/admin/batches/${id}`, { headers }).then((r) => r.data)
    ),
  createBatch: (body) =>
    withAuthRetry((headers) =>
      axios.post(`${BASE}/admin/batches`, body, { headers }).then((r) => r.data)
    ),
  updateBatch: (id, body) =>
    withAuthRetry((headers) =>
      axios.put(`${BASE}/admin/batches/${id}`, body, { headers }).then((r) => r.data)
    ),
  deleteBatch: (id) =>
    withAuthRetry((headers) =>
      axios.delete(`${BASE}/admin/batches/${id}`, { headers }).then((r) => r.data)
    ),
  assignBatch: (traineeId, batchId) =>
    withAuthRetry((headers) =>
      axios
        .patch(
          `${BASE}/admin/trainees/${traineeId}/batch`,
          { batch_id: batchId },
          { headers }
        )
        .then((r) => r.data)
    ),
  myProgress: () =>
    withAuthRetry((headers) =>
      axios.get(`${BASE}/trainee/progress`, { headers }).then((r) => r.data)
    ),
  upsertProgress: (body) =>
    withAuthRetry((headers) =>
      axios.post(`${BASE}/trainee/progress`, body, { headers }).then((r) => r.data)
    ),

  // Resources
  listResourceCategories: () =>
    withAuthRetry((headers) =>
      axios.get(`${BASE}/admin/resources`, { headers }).then((r) => r.data)
    ),
  createResourceCategory: (body) =>
    withAuthRetry((headers) =>
      axios
        .post(`${BASE}/admin/resources/categories`, body, { headers })
        .then((r) => r.data)
    ),
  updateResourceCategory: (id, body) =>
    withAuthRetry((headers) =>
      axios
        .put(`${BASE}/admin/resources/categories/${id}`, body, { headers })
        .then((r) => r.data)
    ),
  deleteResourceCategory: (id) =>
    withAuthRetry((headers) =>
      axios
        .delete(`${BASE}/admin/resources/categories/${id}`, { headers })
        .then((r) => r.data)
    ),
  createResourceLink: (body) =>
    withAuthRetry((headers) =>
      axios.post(`${BASE}/admin/resources/links`, body, { headers }).then((r) => r.data)
    ),
  updateResourceLink: (id, body) =>
    withAuthRetry((headers) =>
      axios
        .put(`${BASE}/admin/resources/links/${id}`, body, { headers })
        .then((r) => r.data)
    ),
  deleteResourceLink: (id) =>
    withAuthRetry((headers) =>
      axios
        .delete(`${BASE}/admin/resources/links/${id}`, { headers })
        .then((r) => r.data)
    ),
};
