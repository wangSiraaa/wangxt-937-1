import { useEffect, useState } from "react";
import { useStore } from "@/store";
import {
  UserMinus,
  CheckCircle,
  AlertCircle,
  X,
  Send,
} from "lucide-react";

const WITHDRAWAL_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "待审批", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "已批准", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "已驳回", cls: "bg-red-50 text-red-600" },
};

export default function Withdrawal() {
  const {
    registrations,
    groups,
    withdrawals,
    fetchRegistrations,
    fetchPublishedGroups,
    fetchWithdrawals,
    submitWithdrawal,
    approveWithdrawal,
    loading,
  } = useStore();

  const [form, setForm] = useState({
    registration_id: "",
    group_id: "",
    reason: "",
  });
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    fetchRegistrations();
    fetchPublishedGroups();
    fetchWithdrawals();
  }, [fetchRegistrations, fetchPublishedGroups, fetchWithdrawals]);

  const groupedRegistrations = registrations.filter(
    (r) => r.status === "grouped"
  );

  const groupedPlayerIds = new Set(groupedRegistrations.map((r) => r.id));

  const availableGroups = groups.filter((g) =>
    g.players.some((p) => groupedPlayerIds.has(p.registration_id))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.registration_id || !form.group_id || !form.reason.trim()) {
      setToast({ type: "err", msg: "请填写完整信息" });
      return;
    }
    try {
      await submitWithdrawal({
        registrationId: Number(form.registration_id),
        groupId: Number(form.group_id),
        reason: form.reason.trim(),
      });
      setToast({ type: "ok", msg: "退赛申请已提交" });
      setForm({ registration_id: "", group_id: "", reason: "" });
    } catch (err: any) {
      setToast({ type: "err", msg: err.message || "提交失败" });
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveWithdrawal(id);
      setToast({ type: "ok", msg: "已批准退赛" });
    } catch (err: any) {
      setToast({ type: "err", msg: err.message || "操作失败" });
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            toast.type === "ok" ? "bg-emerald-500" : "bg-red-500"
          }`}
        >
          {toast.type === "ok" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.msg}
          <button onClick={() => setToast(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <UserMinus className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-primary">退赛处理</h2>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">提交退赛申请</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                选择选手 <span className="text-red-500">*</span>
              </label>
              <select
                className="input-field"
                value={form.registration_id}
                onChange={(e) =>
                  setForm({ ...form, registration_id: e.target.value })
                }
              >
                <option value="">请选择已入组选手</option>
                {groupedRegistrations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.player_name} ({r.id_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                所在分组 <span className="text-red-500">*</span>
              </label>
              <select
                className="input-field"
                value={form.group_id}
                onChange={(e) =>
                  setForm({ ...form, group_id: e.target.value })
                }
              >
                <option value="">请选择分组</option>
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.group_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                退赛原因 <span className="text-red-500">*</span>
              </label>
              <input
                className="input-field"
                value={form.reason}
                onChange={(e) =>
                  setForm({ ...form, reason: e.target.value })
                }
                placeholder="请输入退赛原因"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            提交申请
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">退赛记录</h3>
        {withdrawals.length === 0 ? (
          <p className="py-8 text-center text-gray-400">暂无退赛记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-3 pr-4 font-medium">选手</th>
                  <th className="pb-3 pr-4 font-medium">所在分组</th>
                  <th className="pb-3 pr-4 font-medium">退赛原因</th>
                  <th className="pb-3 pr-4 font-medium">申请时间</th>
                  <th className="pb-3 pr-4 font-medium">状态</th>
                  <th className="pb-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => {
                  const reg = registrations.find(
                    (r) => r.id === w.registration_id
                  );
                  const grp = groups.find((g) => g.id === w.group_id);
                  const st =
                    WITHDRAWAL_STATUS[w.status] ?? {
                      label: w.status,
                      cls: "bg-gray-100 text-gray-600",
                    };

                  return (
                    <tr key={w.id} className="border-b border-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">
                        {reg?.player_name ?? `#${w.registration_id}`}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        {grp?.group_name ?? `#${w.group_id}`}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">{w.reason}</td>
                      <td className="py-2.5 pr-4 text-gray-400">
                        {new Date(w.requested_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {w.status === "pending" && (
                          <button
                            onClick={() => handleApprove(w.id)}
                            disabled={loading}
                            className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            批准
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
