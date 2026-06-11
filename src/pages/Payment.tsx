import { useEffect, useState } from "react";
import { useStore } from "@/store";
import type { Registration } from "@/store";
import {
  CreditCard,
  CheckCircle,
  AlertCircle,
  X,
  DollarSign,
  History,
} from "lucide-react";

export default function PaymentPage() {
  const {
    pendingRegs,
    payments,
    registrations,
    fetchPendingRegistrations,
    fetchPayments,
    fetchRegistrations,
    confirmPayment,
    loading,
  } = useStore();

  const [confirming, setConfirming] = useState<Registration | null>(null);
  const [amount, setAmount] = useState("");
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    fetchPendingRegistrations();
    fetchPayments();
    fetchRegistrations();
  }, [fetchPendingRegistrations, fetchPayments, fetchRegistrations]);

  const confirmedPayments = payments.filter((p) => p.status === "confirmed");

  const getReg = (regId: number) =>
    registrations.find((r) => r.id === regId);

  const handleConfirm = async () => {
    if (!confirming || !amount) return;
    try {
      await confirmPayment(confirming.id, Number(amount));
      setToast({ type: "ok", msg: "缴费确认成功" });
      setConfirming(null);
      setAmount("");
    } catch (err: any) {
      setToast({ type: "err", msg: err.message || "确认失败" });
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
          {toast.type === "ok" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
          <button onClick={() => setToast(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-primary">财务缴费</h2>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-800">待缴费列表</h3>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {pendingRegs.length}
          </span>
        </div>

        {pendingRegs.length === 0 ? (
          <p className="py-8 text-center text-gray-400">暂无待缴费记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-3 pr-4 font-medium">选手姓名</th>
                  <th className="pb-3 pr-4 font-medium">身份证号</th>
                  <th className="pb-3 pr-4 font-medium">手机号</th>
                  <th className="pb-3 pr-4 font-medium">年龄组</th>
                  <th className="pb-3 pr-4 font-medium">参赛证明</th>
                  <th className="pb-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingRegs.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">
                      {r.player_name}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">{r.id_number}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{r.phone}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{r.age_group}</td>
                    <td className="py-2.5 pr-4">
                      {r.proof_verified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <CheckCircle className="h-3 w-3" />
                          已验证
                        </span>
                      ) : r.proof_path ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          待验证
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                          未上传
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => {
                          setConfirming(r);
                          setAmount("200");
                        }}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600"
                      >
                        确认缴费
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-emerald-500" />
          <h3 className="text-lg font-semibold text-gray-800">缴费记录</h3>
        </div>

        {confirmedPayments.length === 0 ? (
          <p className="py-8 text-center text-gray-400">暂无缴费记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-3 pr-4 font-medium">选手姓名</th>
                  <th className="pb-3 pr-4 font-medium">缴费金额</th>
                  <th className="pb-3 pr-4 font-medium">缴费时间</th>
                  <th className="pb-3 font-medium">确认时间</th>
                </tr>
              </thead>
              <tbody>
                {confirmedPayments.map((p) => {
                  const reg = getReg(p.registration_id);
                  return (
                    <tr key={p.id} className="border-b border-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">
                        {reg?.player_name ?? "-"}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        ¥{Number(p.amount).toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        {p.paid_at
                          ? new Date(p.paid_at).toLocaleString("zh-CN")
                          : "-"}
                      </td>
                      <td className="py-2.5 text-gray-500">
                        {p.confirmed_at
                          ? new Date(p.confirmed_at).toLocaleString("zh-CN")
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">确认缴费</h3>
            <p className="mb-4 text-sm text-gray-600">
              选手：<span className="font-medium text-gray-800">{confirming.player_name}</span>
            </p>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">缴费金额（元）</label>
              <input
                type="number"
                step="0.01"
                className="input-field"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="请输入金额"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setConfirming(null); setAmount(""); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || !amount}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-50"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
