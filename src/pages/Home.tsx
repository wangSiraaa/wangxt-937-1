import { useEffect } from "react";
import { useStore } from "@/store";
import {
  Users,
  CreditCard,
  LayoutGrid,
  UserMinus,
  TrendingUp,
} from "lucide-react";

export default function Home() {
  const { registrations, payments, groups, withdrawals, fetchRegistrations, fetchPayments, fetchPublishedGroups, fetchWithdrawals } =
    useStore();

  useEffect(() => {
    fetchRegistrations();
    fetchPayments();
    fetchPublishedGroups();
    fetchWithdrawals();
  }, [fetchRegistrations, fetchPayments, fetchPublishedGroups, fetchWithdrawals]);

  const totalRegistrations = registrations.length;
  const pendingPayments = registrations.filter((r) => r.status === "pending").length;
  const groupedPlayers = groups.reduce(
    (sum, g) => sum + g.players.filter((p) => !p.is_withdrawn).length,
    0
  );
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending").length;

  const stats = [
    {
      label: "报名总数",
      value: totalRegistrations,
      icon: Users,
      bg: "bg-primary",
      iconBg: "bg-primary-700",
    },
    {
      label: "待缴费",
      value: pendingPayments,
      icon: CreditCard,
      bg: "bg-amber-500",
      iconBg: "bg-amber-600",
    },
    {
      label: "已入组选手",
      value: groupedPlayers,
      icon: LayoutGrid,
      bg: "bg-emerald-500",
      iconBg: "bg-emerald-600",
    },
    {
      label: "待处理退赛",
      value: pendingWithdrawals,
      icon: UserMinus,
      bg: "bg-accent",
      iconBg: "bg-accent-600",
    },
  ];

  const recentRegistrations = [...registrations]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-primary">数据概览</h2>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, bg, iconBg }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${bg}`}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-md ${iconBg}`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-primary">最近报名动态</h3>
        {recentRegistrations.length === 0 ? (
          <p className="py-8 text-center text-gray-400">暂无报名记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-3 pr-4 font-medium">选手姓名</th>
                  <th className="pb-3 pr-4 font-medium">身份证号</th>
                  <th className="pb-3 pr-4 font-medium">年龄组</th>
                  <th className="pb-3 pr-4 font-medium">状态</th>
                  <th className="pb-3 font-medium">报名时间</th>
                </tr>
              </thead>
              <tbody>
                {recentRegistrations.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{r.player_name}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{r.id_number}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{r.age_group}</td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2.5 text-gray-400">
                      {new Date(r.created_at).toLocaleDateString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "待缴费", cls: "bg-amber-50 text-amber-700" },
    paid: { label: "已缴费", cls: "bg-emerald-50 text-emerald-700" },
    grouped: { label: "已入组", cls: "bg-blue-50 text-blue-700" },
    withdrawn: { label: "已退赛", cls: "bg-gray-100 text-gray-500" },
    cancelled: { label: "已取消", cls: "bg-red-50 text-red-600" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
