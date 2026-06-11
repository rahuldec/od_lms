import axios from "axios";
import { supabase } from "@/lib/supabaseClient";
const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const authHeader = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
export const api = {
  setupInit: () => axios.post(`${BASE}/setup/init`).then((r) => r.data),
  me: async () =>
    axios.get(`${BASE}/me`, { headers: await authHeader() }).then((r) => r.data),
  listTrainees: async () =>
    axios
      .get(`${BASE}/admin/trainees`, { headers: await authHeader() })
      .then((r) => r.data),
  getTrainee: async (id) =>
    axios
      .get(`${BASE}/admin/trainees/${id}`, { headers: await authHeader() })
      .then((r) => r.data),
  createTrainee: async (body) =>
    axios
      .post(`${BASE}/admin/trainees`, body, { headers: await authHeader() })
      .then((r) => r.data),
  updateTrainee: async (id, body) =>
    axios
      .put(`${BASE}/admin/trainees/${id}`, body, { headers: await authHeader() })
      .then((r) => r.data),
  deleteTrainee: async (id) =>
    axios
      .delete(`${BASE}/admin/trainees/${id}`, { headers: await authHeader() })
      .then((r) => r.data),
  promoteTrainee: async (id) =>
    axios
      .post(
        `${BASE}/admin/trainees/${id}/promote`,
        {},
        { headers: await authHeader() }
      )
      .then((r) => r.data),
  listBatches: async () =>
    axios
      .get(`${BASE}/admin/batches`, { headers: await authHeader() })
      .then((r) => r.data),
  getBatch: async (id) =>
    axios
      .get(`${BASE}/admin/batches/${id}`, { headers: await authHeader() })
      .then((r) => r.data),
  createBatch: async (body) =>
    axios
      .post(`${BASE}/admin/batches`, body, { headers: await authHeader() })
      .then((r) => r.data),
  updateBatch: async (id, body) =>
    axios
      .put(`${BASE}/admin/batches/${id}`, body, { headers: await authHeader() })
      .then((r) => r.data),
  deleteBatch: async (id) =>
    axios
      .delete(`${BASE}/admin/batches/${id}`, { headers: await authHeader() })
      .then((r) => r.data),
  assignBatch: async (traineeId, batchId) =>
    axios
      .patch(
        `${BASE}/admin/trainees/${traineeId}/batch`,
        { batch_id: batchId },
        { headers: await authHeader() }
      )
      .then((r) => r.data),
  myProgress: async () =>
    axios
      .get(`${BASE}/trainee/progress`, { headers: await authHeader() })
      .then((r) => r.data),
  upsertProgress: async (body) =>
    axios
      .post(`${BASE}/trainee/progress`, body, { headers: await authHeader() })
      .then((r) => r.data),
};
