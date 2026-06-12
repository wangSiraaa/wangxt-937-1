import { create } from "zustand";

export interface ApiError extends Error {
  details?: string[];
}

function makeError(msg: string, details?: string[]): ApiError {
  const e = new Error(msg) as ApiError;
  if (details) e.details = details;
  return e;
}

export interface Event {
  id: number;
  name: string;
  category: string;
  description: string;
  fee: number;
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

export interface WaitlistEntry {
  id: number;
  event_id: number;
  age_group: string;
  registration_id: number;
  queue_order: number;
  status: string;
  payment_time: string | null;
  promoted_at: string | null;
  cancelled_at: string | null;
  note: string | null;
  created_at: string;
  player_name?: string;
  id_number?: string;
  phone?: string;
  birth_year?: number;
  event_name?: string;
}

export interface ProjectChange {
  id: number;
  registration_id: number;
  original_event_id: number;
  target_event_id: number;
  original_age_group: string;
  target_age_group: string;
  fee_difference: number;
  difference_status: string;
  paid_at: string | null;
  change_status: string;
  id_number_verified: boolean;
  age_verified: boolean;
  proof_verified: boolean;
  rejection_reason: string | null;
  approved_at: string | null;
  requester_note: string | null;
  created_at: string;
  player_name?: string;
  id_number?: string;
  orig_event_name?: string;
  target_event_name?: string;
  verification_passed?: boolean;
  verification_errors?: string[];
  needs_finance_confirm?: boolean;
  payment_adjustment?: { id: number; difference: number; adjustment_type: string; status: string } | null;
}

export interface PromotionLog {
  id: number;
  event_id: number;
  age_group: string;
  group_id: number | null;
  vacated_slot_number: number | null;
  vacated_registration_id: number | null;
  vacated_reason: string | null;
  promoted_registration_id: number | null;
  promotion_order: number | null;
  queued_waitlist_entry_id: number | null;
  promoted_assignment_id: number | null;
  status: string;
  failure_reason: string | null;
  created_at: string;
  event_name?: string;
  group_name?: string;
  vacated_name?: string;
  promoted_name?: string;
  queue_order?: number;
}

export interface PaymentAdjustment {
  id: number;
  registration_id: number;
  project_change_id: number | null;
  original_amount: number;
  new_amount: number;
  difference: number;
  adjustment_type: string;
  finance_confirmed: boolean;
  confirmed_by: string | null;
  confirmed_at: string | null;
  payment_reference: string | null;
  status: string;
  created_at: string;
  player_name?: string;
  original_event?: string;
  original_event_id?: number;
  target_event_id?: number;
  original_age_group?: string;
  target_age_group?: string;
  target_event?: string;
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
  error: ApiError | null;
  waitlistEntries: WaitlistEntry[];
  projectChanges: ProjectChange[];
  promotionLogs: PromotionLog[];
  paymentAdjustments: PaymentAdjustment[];

  setError: (error: ApiError | null) => void;

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

  fetchWaitlist: (eventId?: number, ageGroup?: string) => Promise<void>;
  addWaitlistEntry: (registrationId: number) => Promise<WaitlistEntry>;
  requestProjectChange: (registrationId: number, targetEventId: number, requesterNote?: string) => Promise<ProjectChange>;
  fetchProjectChanges: () => Promise<void>;
  confirmProjectChangeFee: (changeId: number, confirmedBy?: string, paymentRef?: string) => Promise<void>;
  promoteWaitlist: (eventId: number) => Promise<{ promoted: any[]; skipped: any[] }>;
  executeWithdrawalAndPromote: (registrationId: number, groupId: number, reason?: string) => Promise<any>;
  fetchPromotionLogs: () => Promise<void>;
  fetchPaymentAdjustments: () => Promise<void>;
  confirmPaymentAdjustment: (adjId: number, confirmedBy?: string, paymentRef?: string) => Promise<void>;
  checkAssignEligibility: (groupId: number, registrationIds: number[]) => Promise<{ eligible: any[]; ineligible: any[]; can_assign: boolean }>;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    const err = new Error(body.error || body.message || `请求失败: ${res.status}`) as ApiError;
    if (body.details) {
      err.details = body.details;
    }
    throw err;
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
  waitlistEntries: [],
  projectChanges: [],
  promotionLogs: [],
  paymentAdjustments: [],

  setError: (error) => set({ error }),

  fetchEvents: async () => {
    try {
      const data = await apiFetch<Event[]>("/api/events");
      set({ events: data });
    } catch (e: any) {
      set({ error: makeError(e.message, e.details) });
    }
  },

  fetchRegistrations: async () => {
    try {
      const data = await apiFetch<Registration[]>("/api/registrations");
      set({ registrations: data });
    } catch (e: any) {
      set({ error: makeError(e.message, e.details) });
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

  fetchWaitlist: async (eventId, ageGroup) => {
    try {
      let url = "/api/waitlist";
      const qs: string[] = [];
      if (eventId) qs.push(`event_id=${eventId}`);
      if (ageGroup) qs.push(`age_group=${encodeURIComponent(ageGroup)}`);
      if (qs.length) url += `?${qs.join("&")}`;
      const data = await apiFetch<WaitlistEntry[]>(url);
      set({ waitlistEntries: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  addWaitlistEntry: async (registrationId) => {
    set({ loading: true, error: null });
    try {
      const regRes = await apiFetch<Registration[]>(`/api/registrations?id=${registrationId}`);
      const reg = regRes.length > 0 ? regRes[0] : null;
      if (!reg) throw new Error("Registration not found");
      const res = await apiFetch<WaitlistEntry>("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: reg.event_id,
          age_group: reg.age_group,
          registration_id: registrationId,
        }),
      });
      set({ loading: false });
      await get().fetchWaitlist();
      return res;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  requestProjectChange: async (registrationId, targetEventId, requesterNote) => {
    set({ loading: true, error: null });
    try {
      const res = await apiFetch<ProjectChange>("/api/project-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: registrationId,
          target_event_id: targetEventId,
          requester_note: requesterNote,
        }),
      });
      set({ loading: false });
      await get().fetchProjectChanges();
      await get().fetchRegistrations();
      return res;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchProjectChanges: async () => {
    try {
      const data = await apiFetch<ProjectChange[]>("/api/project-changes");
      set({ projectChanges: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  confirmProjectChangeFee: async (changeId, confirmedBy, paymentRef) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/api/project-change/${changeId}/confirm-fee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed_by: confirmedBy, payment_reference: paymentRef }),
      });
      await get().fetchProjectChanges();
      await get().fetchPaymentAdjustments();
      await get().fetchRegistrations();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  promoteWaitlist: async (eventId) => {
    set({ loading: true, error: null });
    try {
      const allPromoted: any[] = [];
      const allSkipped: any[] = [];
      for (const ag of ["U18", "U23", "Open"]) {
        try {
          const res = await apiFetch<any>("/api/promote-waitlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_id: eventId, age_group: ag }),
          });
          if (res.promoted) allPromoted.push(...res.promoted);
          if (res.skipped) allSkipped.push(...res.skipped);
        } catch {}
      }
      await get().fetchWaitlist(eventId);
      await get().fetchAllGroups(eventId);
      await get().fetchPublishedGroups(eventId);
      await get().fetchPromotionLogs();
      set({ loading: false });
      return { promoted: allPromoted, skipped: allSkipped };
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  executeWithdrawalAndPromote: async (registrationId, groupId, reason) => {
    set({ loading: true, error: null });
    try {
      const res = await apiFetch<any>("/api/withdrawal-and-promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: registrationId,
          group_id: groupId,
          reason: reason,
        }),
      });
      await get().fetchWithdrawals();
      await get().fetchAllGroups();
      await get().fetchPublishedGroups();
      await get().fetchWaitlist();
      await get().fetchPromotionLogs();
      await get().fetchRegistrations();
      set({ loading: false });
      return res;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchPromotionLogs: async () => {
    try {
      const data = await apiFetch<PromotionLog[]>("/api/promotion-logs");
      set({ promotionLogs: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchPaymentAdjustments: async () => {
    try {
      const data = await apiFetch<PaymentAdjustment[]>("/api/payment-adjustments");
      set({ paymentAdjustments: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  confirmPaymentAdjustment: async (adjId, confirmedBy, paymentRef) => {
    set({ loading: true, error: null });
    try {
      await apiFetch(`/api/payment-adjustments/${adjId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed_by: confirmedBy, payment_reference: paymentRef }),
      });
      await get().fetchPaymentAdjustments();
      await get().fetchProjectChanges();
      await get().fetchRegistrations();
      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  checkAssignEligibility: async (groupId, registrationIds) => {
    try {
      const res = await apiFetch<any>("/api/grouping/check-assign-eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_ids: registrationIds, group_id: groupId }),
      });
      return { eligible: res.eligible || [], ineligible: res.ineligible || [], can_assign: res.can_assign };
    } catch (e: any) {
      set({ error: e.message });
      throw e;
    }
  },
}));
