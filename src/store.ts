import { create } from "zustand";

export interface Event {
  id: number;
  name: string;
  category: string;
  description: string;
}

export interface AgeRule {
  id: number;
  event_id: number;
  group_name: string;
  min_age: number;
  max_age: number;
}

export interface Registration {
  id: number;
  player_name: string;
  id_number: string;
  phone: string;
  birth_year: number;
  age_group: string;
  emergency_contact: string;
  emergency_phone: string;
  event_id: number;
  proof_path: string | null;
  proof_verified: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: number;
  registration_id: number;
  amount: number;
  status: string;
  paid_at: string | null;
  confirmed_at: string | null;
}

export interface Group {
  id: number;
  event_id: number;
  group_name: string;
  published: number;
  published_at: string | null;
}

export interface GroupPlayer {
  assignment_id: number;
  registration_id: number;
  slot_number: number;
  is_withdrawn: number;
  withdrawal_reason: string | null;
  player_name: string;
  id_number: string;
  age_group: string;
}

export interface GroupWithPlayers extends Group {
  event_name?: string;
  players: GroupPlayer[];
}

export interface Withdrawal {
  id: number;
  registration_id: number;
  group_id: number;
  reason: string;
  status: string;
  requested_at: string;
  approved_at: string | null;
}

interface AppState {
  events: Event[];
  registrations: Registration[];
  payments: Payment[];
  pendingRegs: Registration[];
  groups: GroupWithPlayers[];
  allGroups: GroupWithPlayers[];
  withdrawals: Withdrawal[];
  eligiblePlayers: Registration[];
  loading: boolean;
  error: string | null;

  fetchEvents: () => Promise<void>;
  fetchRegistrations: () => Promise<void>;
  createRegistration: (data: FormData) => Promise<void>;
  updateRegistration: (id: number, data: FormData | Record<string, any>) => Promise<void>;
  deleteRegistration: (id: number) => Promise<void>;
  uploadProof: (id: number, file: File) => Promise<void>;
  fetchPendingRegistrations: () => Promise<void>;
  confirmPayment: (registrationId: number, amount: number) => Promise<void>;
  fetchPayments: () => Promise<void>;
  fetchEligiblePlayers: (eventId?: number) => Promise<void>;
  fetchAllGroups: (eventId?: number) => Promise<void>;
  assignToGroup: (groupId: number, registrationIds: number[]) => Promise<void>;
  updateGroupAssignments: (groupId: number, registrationIds: number[]) => Promise<void>;
  publishGroups: (groupIds: number[]) => Promise<void>;
  fetchPublishedGroups: (eventId?: number) => Promise<void>;
  fetchWithdrawals: () => Promise<void>;
  submitWithdrawal: (data: {
    registrationId: number;
    groupId: number;
    reason: string;
  }) => Promise<void>;
  approveWithdrawal: (id: number) => Promise<void>;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    throw new Error(body.error || body.message || `请求失败: ${res.status}`);
  }
  return body.data as T;
}

export const useStore = create<AppState>((set, get) => ({
  events: [],
  registrations: [],
  payments: [],
  pendingRegs: [],
  groups: [],
  allGroups: [],
  withdrawals: [],
  eligiblePlayers: [],
  loading: false,
  error: null,

  fetchEvents: async () => {
    try {
      const data = await apiFetch<Event[]>("/api/events");
      set({ events: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchRegistrations: async () => {
    try {
      const data = await apiFetch<Registration[]>("/api/registrations");
      set({ registrations: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  createRegistration: async (data) => {
    set({ loading: true, error: null });
    try {
      await apiFetch("/api/registrations", { method: "POST", body: data });
      await get().fetchRegistrations();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  updateRegistration: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const isFormData = data instanceof FormData;
      await apiFetch(`/api/registrations/${id}`, {
        method: "PUT",
        ...(isFormData
          ? { body: data }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            }),
      });
      await get().fetchRegistrations();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  deleteRegistration: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/api/registrations/${id}`, { method: "DELETE" });
      await get().fetchRegistrations();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  uploadProof: async (id, file) => {
    set({ loading: true, error: null });
    try {
      const form = new FormData();
      form.append("proof", file);
      await apiFetch(`/api/registrations/${id}/proof`, {
        method: "POST",
        body: form,
      });
      await get().fetchRegistrations();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchPendingRegistrations: async () => {
    try {
      const data = await apiFetch<Registration[]>("/api/payments/pending");
      set({ pendingRegs: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  confirmPayment: async (registrationId, amount) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/api/payments/${registrationId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      await get().fetchPayments();
      await get().fetchPendingRegistrations();
      await get().fetchRegistrations();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchPayments: async () => {
    try {
      const data = await apiFetch<Payment[]>("/api/payments");
      set({ payments: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchEligiblePlayers: async (eventId) => {
    set({ loading: true, error: null });
    try {
      const url = eventId
        ? `/api/groupings/eligible?event_id=${eventId}`
        : "/api/groupings/eligible";
      const data = await apiFetch<Registration[]>(url);
      set({ eligiblePlayers: data, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchAllGroups: async (eventId) => {
    try {
      const url = eventId
        ? `/api/groupings/all?event_id=${eventId}`
        : "/api/groupings/all";
      const data = await apiFetch<GroupWithPlayers[]>(url);
      set({ allGroups: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  assignToGroup: async (groupId, registrationIds) => {
    set({ loading: true, error: null });
    try {
      await apiFetch("/api/groupings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, registrationIds }),
      });
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  updateGroupAssignments: async (groupId, registrationIds) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/api/groupings/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationIds }),
      });
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  publishGroups: async (groupIds) => {
    set({ loading: true, error: null });
    try {
      await apiFetch("/api/groupings/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds }),
      });
      await get().fetchPublishedGroups();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchPublishedGroups: async (eventId) => {
    try {
      const url = eventId
        ? `/api/groupings/published?event_id=${eventId}`
        : "/api/groupings/published";
      const data = await apiFetch<GroupWithPlayers[]>(url);
      set({ groups: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchWithdrawals: async () => {
    try {
      const data = await apiFetch<Withdrawal[]>("/api/withdrawals");
      set({ withdrawals: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  submitWithdrawal: async (data) => {
    set({ loading: true, error: null });
    try {
      await apiFetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await get().fetchWithdrawals();
      await get().fetchRegistrations();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  approveWithdrawal: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/api/withdrawals/${id}/approve`, {
        method: "PUT",
      });
      await get().fetchWithdrawals();
      await get().fetchRegistrations();
      await get().fetchPublishedGroups();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },
}));
