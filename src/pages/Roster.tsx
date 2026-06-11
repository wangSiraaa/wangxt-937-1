import { useEffect, useState } from "react";
import { useStore } from "@/store";
import type { GroupWithPlayers } from "@/store";
import { FileText, Printer, Trophy } from "lucide-react";

export default function Roster() {
  const { events, groups, fetchEvents, fetchPublishedGroups } = useStore();
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);

  useEffect(() => {
    fetchEvents();
    fetchPublishedGroups();
  }, [fetchEvents, fetchPublishedGroups]);

  useEffect(() => {
    if (selectedEvent) {
      fetchPublishedGroups(selectedEvent);
    }
  }, [selectedEvent, fetchPublishedGroups]);

  const displayGroups = selectedEvent
    ? groups.filter((g) => g.event_id === selectedEvent)
    : groups;

  const publishedGroups = displayGroups.filter((g) => g.published);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-primary">分组名单</h2>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="input-field w-64"
            value={selectedEvent ?? ""}
            onChange={(e) =>
              setSelectedEvent(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">全部赛事</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Printer className="h-4 w-4" />
            打印名单
          </button>
        </div>
      </div>

      {publishedGroups.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm print:hidden">
          <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-400">暂无已发布的分组</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 print:grid-cols-1 print:gap-4 lg:grid-cols-2">
          {publishedGroups.map((group) => (
            <RosterCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function RosterCard({ group }: { group: GroupWithPlayers }) {
  const activePlayers = group.players.filter((p) => !p.is_withdrawn);
  const withdrawnPlayers = group.players.filter((p) => p.is_withdrawn);

  return (
    <div className="roster-card break-inside-avoid rounded-xl border border-gray-200 bg-white shadow-sm print:shadow-none">
      <div className="flex items-center gap-3 border-b-2 border-primary bg-primary-50 px-5 py-3 print:bg-gray-100">
        <Trophy className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-primary">{group.group_name}</h3>
        {group.event_name && (
          <span className="ml-auto text-xs text-gray-400">
            {group.event_name}
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="pb-2 pr-3 font-medium w-8">序号</th>
              <th className="pb-2 pr-3 font-medium">姓名</th>
              <th className="pb-2 pr-3 font-medium">身份证号</th>
              <th className="pb-2 font-medium">年龄组</th>
            </tr>
          </thead>
          <tbody>
            {activePlayers.map((p, idx) => (
              <tr key={p.assignment_id} className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-400">{idx + 1}</td>
                <td className="py-2 pr-3 font-medium text-gray-800">
                  {p.player_name}
                </td>
                <td className="py-2 pr-3 text-gray-500">{p.id_number}</td>
                <td className="py-2 text-gray-500">{p.age_group}</td>
              </tr>
            ))}
            {withdrawnPlayers.map((p) => (
              <tr key={p.assignment_id} className="border-b border-gray-50">
                <td className="py-2 pr-3 text-gray-300">-</td>
                <td className="py-2 pr-3 text-gray-300 line-through">
                  {p.player_name}
                </td>
                <td className="py-2 pr-3 text-gray-300 line-through">
                  {p.id_number}
                </td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">
                    退赛
                    {p.withdrawal_reason && `: ${p.withdrawal_reason}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>合计: {activePlayers.length} 人</span>
          {withdrawnPlayers.length > 0 && (
            <span>退赛: {withdrawnPlayers.length} 人</span>
          )}
        </div>
      </div>
    </div>
  );
}
