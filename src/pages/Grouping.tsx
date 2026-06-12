import { useEffect, useState, useCallback, useMemo } from "react";
import { useStore } from "@/store";
import type {
  Registration,
  GroupWithPlayers,
  GroupPlayer,
  WaitlistEntry,
  ProjectChange,
  PromotionLog,
  PaymentAdjustment,
} from "@/store";
import {
  LayoutGrid,
  GripVertical,
  Send,
  Lock,
  AlertCircle,
  Users,
  X,
  Info,
  RefreshCw,
  CheckCircle2,
  XCircle,
  UserMinus,
  Clock,
  DollarSign,
  ArrowRightLeft,
  ListOrdered,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";

type TabKey = "grouping" | "changes" | "waitlist" | "payment" | "withdraw" | "logs";

function extractAgeGroup(groupName: string): string {
  const parts = groupName.split("-");
  return parts[parts.length - 1];
}

function validateAgeGroupMatch(
  regAgeGroup: string,
  groupAgeGroup: string,
  playerName: string
): string | null {
  if (regAgeGroup === groupAgeGroup) return null;
  const map: Record<string, string[]> = { U18: ["U18"], U23: ["U23"], Open: ["Open"] };
  if (!(map[regAgeGroup] || []).includes(groupAgeGroup)) {
    return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（年龄组严格隔离）`;
  }
  return null;
}

interface ValidationError {
  message: string;
  details?: string[];
}

function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

function VerifiedBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
        ok ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function Grouping() {
  const store = useStore();
  const {
    events,
    eligiblePlayers,
    allGroups,
    waitlistEntries,
    projectChanges,
    promotionLogs,
    paymentAdjustments,
    fetchEvents,
    fetchEligiblePlayers,
    fetchAllGroups,
    assignToGroup,
    publishGroups,
    fetchWaitlist,
    addWaitlistEntry,
    requestProjectChange,
    fetchProjectChanges,
    confirmProjectChangeFee,
    promoteWaitlist,
    executeWithdrawalAndPromote,
    fetchPromotionLogs,
    fetchPaymentAdjustments,
    confirmPaymentAdjustment,
    checkAssignEligibility,
    loading,
  } = store;

  const [tab, setTab] = useState<TabKey>("grouping");
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [activePlayer, setActivePlayer] = useState<Registration | null>(null);
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);

  const [changeOpen, setChangeOpen] = useState(false);
  const [changePlayer, setChangePlayer] = useState<Registration | null>(null);
  const [changeTarget, setChangeTarget] = useState<string>("");
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistPlayer, setWaitlistPlayer] = useState<Registration | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawPlayer, setWithdrawPlayer] = useState<GroupPlayer | null>(null);
  const [withdrawGroupId, setWithdrawGroupId] = useState<number>(0);
  const [withdrawReason, setWithdrawReason] = useState("");

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const sensors = useSensors(pointerSensor);

  useEffect(() => {
    fetchEvents();
    fetchProjectChanges();
    fetchPromotionLogs();
    fetchPaymentAdjustments();
  }, [fetchEvents, fetchProjectChanges, fetchPromotionLogs, fetchPaymentAdjustments]);

  useEffect(() => {
    if (selectedEvent) {
      fetchEligiblePlayers(selectedEvent);
      fetchAllGroups(selectedEvent);
      fetchWaitlist(selectedEvent);
      setValidationError(null);
    }
  }, [selectedEvent, fetchEligiblePlayers, fetchAllGroups, fetchWaitlist]);

  const eventGroups = useMemo(
    () => allGroups.filter((g) => g.event_id === selectedEvent),
    [allGroups, selectedEvent]
  );
  const eventWaitlist = useMemo(
    () => waitlistEntries.filter((w) => w.event_id === selectedEvent),
    [waitlistEntries, selectedEvent]
  );

  const canDropIntoGroup = useCallback(
    (player: Registration, group: GroupWithPlayers) => {
      if (group.published) return { canDrop: false, reason: "该分组已发布，无法添加选手" };
      const ageError = validateAgeGroupMatch(
        player.age_group,
        extractAgeGroup(group.group_name),
        player.player_name
      );
      if (ageError) return { canDrop: false, reason: ageError };
      return { canDrop: true };
    },
    []
  );

  const handleDragStart = (e: DragStartEvent) => {
    const id = e.active.id as number;
    const player = eligiblePlayers.find((p) => p.id === id);
    if (player) setActivePlayer(player);
    setValidationError(null);
  };
  const handleDragOver = (e: DragOverEvent) => {
    if (!e.over) return setHoveredGroup(null);
    const overId = String(e.over.id);
    setHoveredGroup(overId.startsWith("group-") ? Number(overId.replace("group-", "")) : null);
  };

  const handleDragEnd = useCallback(
    async (e: DragEndEvent) => {
      setActivePlayer(null);
      setHoveredGroup(null);
      const { active, over } = e;
      if (!over || !selectedEvent) return;
      const overId = String(over.id);
      if (!overId.startsWith("group-")) return;
      const groupId = Number(overId.replace("group-", ""));
      const targetGroup = eventGroups.find((g) => g.id === groupId);
      const player = eligiblePlayers.find((p) => p.id === (active.id as number));
      if (!targetGroup || !player) return;
      if (targetGroup.published) {
        setValidationError({ message: "该分组已发布，无法添加选手" });
        return;
      }
      const ageCheck = validateAgeGroupMatch(
        player.age_group,
        extractAgeGroup(targetGroup.group_name),
        player.player_name
      );
      if (ageCheck) {
        setValidationError({ message: "年龄组校验失败", details: [ageCheck] });
        return;
      }
      try {
        const elig = await checkAssignEligibility(groupId, [player.id]);
        if (elig.ineligible && elig.ineligible.length > 0) {
          const msgs = elig.ineligible.map((i) => i.reason);
          setValidationError({ message: "入组资格校验失败", details: msgs });
          return;
        }
        await assignToGroup(groupId, [player.id]);
        await fetchEligiblePlayers(selectedEvent);
        await fetchAllGroups(selectedEvent);
        setValidationError(null);
      } catch (err: any) {
        setValidationError({ message: err.message || "分组失败", details: err.details });
      }
    },
    [selectedEvent, eventGroups, eligiblePlayers, assignToGroup, fetchEligiblePlayers, fetchAllGroups, checkAssignEligibility]
  );

  const handlePublish = async (groupId: number) => {
    if (!confirm("确认发布此分组？发布后无法再调整选手。")) return;
    try {
      await publishGroups([groupId]);
      if (selectedEvent) {
        await fetchAllGroups(selectedEvent);
        await fetchEligiblePlayers(selectedEvent);
      }
    } catch (err: any) {
      setValidationError({ message: err.message || "发布失败", details: err.details });
    }
  };

  const openChangeModal = (p: Registration) => {
    setChangePlayer(p);
    setChangeTarget("");
    setChangeOpen(true);
  };
  const submitChange = async () => {
    if (!changePlayer || !changeTarget) return;
    try {
      const res = await requestProjectChange(changePlayer.id, Number(changeTarget));
      alert(
        res.difference_status === "unpaid"
          ? `改签申请提交成功，需补缴差额 ¥${res.fee_difference}，财务确认后方可入组`
          : "改签成功"
      );
      setChangeOpen(false);
      fetchEligiblePlayers(selectedEvent!);
      fetchProjectChanges();
    } catch (err: any) {
      alert(err.message || "改签失败");
    }
  };

  const openWaitlistModal = (p: Registration) => {
    setWaitlistPlayer(p);
    setWaitlistOpen(true);
  };
  const submitWaitlist = async () => {
    if (!waitlistPlayer) return;
    try {
      await addWaitlistEntry(waitlistPlayer.id);
      alert("加入候补成功");
      setWaitlistOpen(false);
      fetchWaitlist(selectedEvent!);
    } catch (err: any) {
      alert(err.message || "加入候补失败");
    }
  };

  const openWithdrawModal = (p: GroupPlayer, gId: number) => {
    setWithdrawPlayer(p);
    setWithdrawGroupId(gId);
    setWithdrawReason("");
    setWithdrawOpen(true);
  };
  const submitWithdraw = async () => {
    if (!withdrawPlayer) return;
    if (!withdrawReason.trim()) return alert("请填写退赛原因");
    try {
      const res = await executeWithdrawalAndPromote(
        withdrawPlayer.registration_id,
        withdrawGroupId,
        withdrawReason
      );
      alert(
        `退赛成功：\n递补成功 ${res.promoted?.length || 0} 人\n跳过 ${res.skipped?.length || 0} 人` +
          (res.promoted?.length ? `\n递补选手：${res.promoted.map((x) => x.player_name).join("、")}` : "")
      );
      setWithdrawOpen(false);
      fetchAllGroups(selectedEvent!);
      fetchPromotionLogs();
      fetchWaitlist(selectedEvent!);
    } catch (err: any) {
      alert(err.message || "退赛失败");
    }
  };

  const tabs: { k: TabKey; label: string; icon: React.ReactNode }[] = [
    { k: "grouping", label: "分组编排", icon: <LayoutGrid className="h-4 w-4" /> },
    { k: "changes", label: "项目改签", icon: <ArrowRightLeft className="h-4 w-4" /> },
    { k: "waitlist", label: "候补递补", icon: <ListOrdered className="h-4 w-4" /> },
    { k: "payment", label: "差额缴费", icon: <DollarSign className="h-4 w-4" /> },
    { k: "withdraw", label: "发布后退赛", icon: <UserMinus className="h-4 w-4" /> },
    { k: "logs", label: "递补链路", icon: <ShieldCheck className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-primary">裁判分组</h2>
        </div>
        <select
          className="input-field w-64"
          value={selectedEvent ?? ""}
          onChange={(e) => setSelectedEvent(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">请选择赛事</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} (¥{ev.fee})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1.5 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t.k
                ? "bg-primary text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {validationError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="font-medium">{validationError.message}</p>
              {validationError.details && validationError.details.length > 0 && (
                <ul className="mt-2 space-y-1 pl-1 text-red-600">
                  {validationError.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-red-400">•</span>
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button onClick={() => setValidationError(null)} className="text-red-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {tab === "grouping" && selectedEvent && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>拖拽左侧选手到对应年龄组分组。U18/U23/Open 严格隔离。改项目差额未缴不可入组。</span>
        </div>
      )}

      {tab === "grouping" && !selectedEvent && (
        <EmptyHint text="请先选择赛事" />
      )}
      {tab === "grouping" && selectedEvent && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
            <PlayerPool
              players={eligiblePlayers}
              onChange={openChangeModal}
              onWaitlist={openWaitlistModal}
            />
            <GroupsPanel
              groups={eventGroups}
              onPublish={handlePublish}
              loading={loading}
              activePlayer={activePlayer}
              canDropIntoGroup={canDropIntoGroup}
              hoveredGroup={hoveredGroup}
              onWithdraw={openWithdrawModal}
            />
          </div>
          <DragOverlay dropAnimation={null}>
            {activePlayer && (
              <div className="flex items-center gap-2 rounded-lg border-2 border-accent bg-white px-3 py-2 shadow-lg">
                <GripVertical className="h-4 w-4 text-accent" />
                <span className="font-medium text-gray-800">{activePlayer.player_name}</span>
                <span className="rounded bg-primary-100 px-1.5 py-0.5 text-xs font-medium text-primary-700">
                  {activePlayer.age_group}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {tab === "changes" && (
        <ProjectChangesView
          items={projectChanges}
          events={events}
          onConfirm={(id) =>
            confirmProjectChangeFee(id).then(() => {
              fetchProjectChanges();
              fetchPaymentAdjustments();
            })
          }
        />
      )}

      {tab === "waitlist" && (
        <WaitlistView
          entries={eventWaitlist}
          selectedEvent={selectedEvent}
          onPromote={() =>
            promoteWaitlist(selectedEvent!).then(() => {
              fetchWaitlist(selectedEvent!);
              fetchPromotionLogs();
              fetchAllGroups(selectedEvent!);
            })
          }
          onRefresh={() => fetchWaitlist(selectedEvent!)}
        />
      )}

      {tab === "payment" && (
        <PaymentAdjustmentsView
          items={paymentAdjustments}
          events={events}
          onConfirm={(id) =>
            confirmPaymentAdjustment(id).then(() => fetchPaymentAdjustments())
          }
        />
      )}

      {tab === "withdraw" && (
        <PublishedWithdrawView
          groups={eventGroups}
          onWithdraw={openWithdrawModal}
          onRefresh={() => fetchAllGroups(selectedEvent!)}
        />
      )}

      {tab === "logs" && <PromotionLogsView items={promotionLogs} />}

      <Modal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title={`改签项目：${changePlayer?.player_name ?? ""}`}
        footer={
          <>
            <button onClick={() => setChangeOpen(false)} className="btn-ghost">
              取消
            </button>
            <button onClick={submitChange} className="btn-primary">
              提交
            </button>
          </>
        }
      >
        <label className="mb-1 block text-sm font-medium text-gray-700">选择目标赛事</label>
        <select
          className="input-field w-full"
          value={changeTarget}
          onChange={(e) => setChangeTarget(e.target.value)}
        >
          <option value="">请选择</option>
          {events
            .filter((e) => e.id !== changePlayer?.event_id)
            .map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} - ¥{ev.fee}
              </option>
            ))}
        </select>
        <p className="mt-3 text-xs text-gray-500">
          系统将自动校验证件号（不重复）、年龄组、参赛证明有效性，并根据两赛事费用差额判断是否需补缴。
        </p>
      </Modal>

      <Modal
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        title="加入候补队列"
        footer={
          <>
            <button onClick={() => setWaitlistOpen(false)} className="btn-ghost">取消</button>
            <button onClick={submitWaitlist} className="btn-primary">确认加入</button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          将 <b>{waitlistPlayer?.player_name}</b> 加入候补队列？
        </p>
        <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          <li>• 候补顺序按缴费时间 + 入队顺序</li>
          <li>• 未缴费 / 证明缺失 / 年龄不符将被拒绝</li>
          <li>• 出现空位时系统会自动校验资格并递补</li>
        </ul>
      </Modal>

      <Modal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="退赛确认（已发布分组）"
        footer={
          <>
            <button onClick={() => setWithdrawOpen(false)} className="btn-ghost">取消</button>
            <button onClick={submitWithdraw} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium text-white">
              确认退赛并递补
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <p className="font-semibold">⚠️ 已发布分组退赛规则</p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>1. 不直接移除选手，仅标记退赛并保留空位说明</li>
              <li>2. 自动按候补顺序校验资格（缴费/证明/年龄）递补</li>
              <li>3. 所有递补与跳过都会写入完整链路日志</li>
              <li>4. 递补失败的候选项将记录具体原因</li>
            </ul>
          </div>
          <p className="text-sm text-gray-700">
            退赛选手：<b>{withdrawPlayer?.player_name}</b>（{withdrawPlayer?.age_group}）
          </p>
          <label className="mb-1 block text-sm font-medium text-gray-700">退赛原因</label>
          <textarea
            className="input-field w-full"
            rows={3}
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
            placeholder="请填写退赛原因，将作为空位说明显示"
          />
        </div>
      </Modal>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white p-12 text-center shadow-sm">
      <LayoutGrid className="mx-auto mb-3 h-12 w-12 text-gray-300" />
      <p className="text-gray-400">{text}</p>
    </div>
  );
}

function PlayerPool({
  players,
  onChange,
  onWaitlist,
}: {
  players: Registration[];
  onChange: (p: Registration) => void;
  onWaitlist: (p: Registration) => void;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-gray-800">选手池</h3>
        <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary">
          {players.length}
        </span>
      </div>
      {players.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">无待分组选手</p>
      ) : (
        <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto">
          {players.map((p) => (
            <DraggablePlayerCard key={p.id} player={p} onChange={onChange} onWaitlist={onWaitlist} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggablePlayerCard({
  player,
  onChange,
  onWaitlist,
}: {
  player: Registration;
  onChange: (p: Registration) => void;
  onWaitlist: (p: Registration) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    data: { type: "player", player },
  });
  const ageGroupColor: Record<string, string> = {
    U18: "bg-emerald-100 text-emerald-700",
    U23: "bg-amber-100 text-amber-700",
    Open: "bg-purple-100 text-purple-700",
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition-all hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-gray-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">{player.player_name}</p>
          <p className="text-xs text-gray-400">{player.id_number.slice(0, 8)}***</p>
        </div>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            ageGroupColor[player.age_group] || "bg-gray-100 text-gray-600"
          }`}
        >
          {player.age_group}
        </span>
      </div>
      <div className="flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange(player);
          }}
          className="flex-1 rounded border border-accent/30 bg-accent/5 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
        >
          改签
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onWaitlist(player);
          }}
          className="flex-1 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-100"
        >
          候补
        </button>
      </div>
    </div>
  );
}

function GroupsPanel({
  groups,
  onPublish,
  loading,
  activePlayer,
  canDropIntoGroup,
  hoveredGroup,
  onWithdraw,
}: {
  groups: GroupWithPlayers[];
  onPublish: (gid: number) => void;
  loading: boolean;
  activePlayer: Registration | null;
  canDropIntoGroup: (p: Registration, g: GroupWithPlayers) => { canDrop: boolean; reason?: string };
  hoveredGroup: number | null;
  onWithdraw: (p: GroupPlayer, gId: number) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl bg-white p-12 text-center shadow-sm">
        <LayoutGrid className="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p className="text-gray-400">暂无分组数据</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {groups.map((g) => {
        const dropCheck =
          activePlayer && hoveredGroup === g.id ? canDropIntoGroup(activePlayer, g) : { canDrop: true };
        return (
          <GroupCard
            key={g.id}
            group={g}
            onPublish={onPublish}
            loading={loading}
            dropCheck={dropCheck}
            isHovered={hoveredGroup === g.id}
            activePlayer={activePlayer}
            onWithdraw={onWithdraw}
          />
        );
      })}
    </div>
  );
}

function GroupCard({
  group,
  onPublish,
  loading,
  dropCheck,
  isHovered,
  activePlayer,
  onWithdraw,
}: {
  group: GroupWithPlayers;
  onPublish: (gid: number) => void;
  loading: boolean;
  dropCheck: { canDrop: boolean; reason?: string };
  isHovered: boolean;
  activePlayer: Registration | null;
  onWithdraw: (p: GroupPlayer, gId: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${group.id}`,
    data: { type: "group", group },
    disabled: !!group.published,
  });
  const ga = extractAgeGroup(group.group_name);
  const agColor: Record<string, string> = {
    U18: "border-emerald-200 bg-emerald-50/30",
    U23: "border-amber-200 bg-amber-50/30",
    Open: "border-purple-200 bg-purple-50/30",
  };
  const invalidDrop = isHovered && activePlayer && !dropCheck.canDrop;
  const validDrop = isOver && !group.published && dropCheck.canDrop;
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 bg-white shadow-sm transition-all ${
        invalidDrop
          ? "border-red-300 bg-red-50/50"
          : validDrop
          ? agColor[ga] || "border-accent bg-accent-50/30"
          : group.published
          ? "border-gray-200"
          : "border-gray-100"
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-gray-800">{group.group_name}</h4>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
              ga === "U18"
                ? "bg-emerald-100 text-emerald-700"
                : ga === "U23"
                ? "bg-amber-100 text-amber-700"
                : "bg-purple-100 text-purple-700"
            }`}
          >
            {ga}
          </span>
          {group.published ? (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              <Lock className="h-3 w-3" />
              已发布
            </span>
          ) : (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">编排中</span>
          )}
        </div>
        <span className="text-xs text-gray-400">{group.players.filter((p) => !p.is_withdrawn).length} 人</span>
      </div>
      {invalidDrop && dropCheck.reason && (
        <div className="mx-4 mt-3 rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {dropCheck.reason}
          </div>
        </div>
      )}
      <div className="min-h-[60px] px-4 py-3">
        {group.players.length === 0 ? (
          <p className="py-2 text-center text-xs text-gray-300">
            {group.published ? "暂无选手" : "拖入选手到此处"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {group.players.map((p) => (
              <PlayerChip
                key={p.assignment_id}
                player={p}
                locked={!!group.published}
                onWithdraw={() => onWithdraw(p, group.id)}
              />
            ))}
          </div>
        )}
      </div>
      {!group.published && (
        <div className="border-t border-gray-50 px-4 py-3">
          <button
            onClick={() => onPublish(group.id)}
            disabled={loading || group.players.filter((p) => !p.is_withdrawn).length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            发布
          </button>
        </div>
      )}
    </div>
  );
}

function PlayerChip({
  player,
  locked,
  onWithdraw,
}: {
  player: GroupPlayer;
  locked: boolean;
  onWithdraw?: () => void;
}) {
  const [showBtn, setShowBtn] = useState(false);
  const agColor: Record<string, string> = {
    U18: "border-emerald-200 bg-emerald-50 text-emerald-700",
    U23: "border-amber-200 bg-amber-50 text-amber-700",
    Open: "border-purple-200 bg-purple-50 text-purple-700",
  };
  return (
    <div
      className={`group relative flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        player.is_withdrawn
          ? "border-gray-200 bg-gray-50 text-gray-400 line-through"
          : locked
          ? "border-gray-200 bg-gray-50 text-gray-600"
          : agColor[player.age_group] || "border-gray-200 bg-gray-50 text-gray-600"
      }`}
      onMouseEnter={() => setShowBtn(true)}
      onMouseLeave={() => setShowBtn(false)}
    >
      <span>{player.player_name}</span>
      <span className="rounded bg-white/60 px-1 text-[10px] font-medium opacity-70">{player.age_group}</span>
      {player.is_withdrawn ? (
        <span className="text-[10px] bg-red-50 text-red-600 rounded px-1.5 py-0.5">
          空位：{player.withdrawal_reason || "退赛"}
        </span>
      ) : locked && onWithdraw ? (
        showBtn && (
          <button
            onClick={onWithdraw}
            className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-600"
            title="退赛并候补递补"
          >
            <UserMinus className="h-3 w-3 inline" />
            退赛
          </button>
        )
      ) : null}
    </div>
  );
}

function ProjectChangesView({
  items,
  events,
  onConfirm,
}: {
  items: ProjectChange[];
  events: { id: number; name: string; fee: number }[];
  onConfirm: (id: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const evMap = new Map(events.map((e) => [e.id, e]));
  return (
    <div className="rounded-xl bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="font-semibold text-gray-800">项目改签记录</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          重复证件阻断 / 年龄不符不可改签 / 差额未缴不得入组
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyHint text="暂无改签记录，可在「分组编排」选手池点击「改签」" />
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((c) => {
            const src = evMap.get(c.original_event_id);
            const tgt = evMap.get(c.target_event_id);
            const open = expanded === c.id;
            return (
              <div key={c.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpanded(open ? null : c.id)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 grid grid-cols-6 gap-2 text-xs items-center">
                    <span className="font-medium text-gray-800 col-span-1">{c.player_name || "-"}</span>
                    <span className="col-span-1 text-gray-600 truncate">{src?.name || `#${c.original_event_id}`}</span>
                    <div className="col-span-1 flex justify-center text-gray-400">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </div>
                    <span className="col-span-1 text-gray-600 truncate">{tgt?.name || `#${c.target_event_id}`}</span>
                    <span className="col-span-1">
                      {c.fee_difference > 0 ? (
                        <span className="text-amber-600 font-medium">差额 +¥{c.fee_difference}</span>
                      ) : c.fee_difference < 0 ? (
                        <span className="text-emerald-600 font-medium">差额 ¥{c.fee_difference}</span>
                      ) : (
                        <span className="text-gray-500">无差额</span>
                      )}
                    </span>
                    <div className="col-span-1 flex items-center justify-end gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                          c.change_status === "approved"
                            ? "bg-emerald-50 text-emerald-600"
                            : c.change_status === "rejected"
                            ? "bg-red-50 text-red-600"
                            : c.difference_status === "unpaid"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        {c.change_status === "approved"
                          ? "已完成"
                          : c.difference_status === "unpaid"
                          ? "待缴差额"
                          : c.change_status === "rejected"
                          ? "已拒绝"
                          : "待处理"}
                      </span>
                      {c.difference_status === "unpaid" && (
                        <button
                          onClick={() => onConfirm(c.id)}
                          className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-amber-600"
                        >
                          确认差额
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {open && (
                  <div className="ml-7 mt-3 space-y-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                    <div className="flex flex-wrap gap-2">
                      <VerifiedBadge ok={c.id_number_verified} label="证件查重" />
                      <VerifiedBadge ok={c.age_verified} label="年龄组" />
                      <VerifiedBadge ok={c.proof_verified} label="参赛证明" />
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        c.difference_status === "confirmed"
                          ? "bg-emerald-50 text-emerald-600"
                          : c.difference_status === "unpaid"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        <DollarSign className="h-3 w-3" />
                        差额：{c.difference_status === "confirmed" ? "已缴" : c.difference_status === "unpaid" ? "未缴" : "无需"}
                      </span>
                    </div>
                    <p>原赛事：¥{src?.fee ?? "-"} → 目标赛事：¥{tgt?.fee ?? "-"}</p>
                    <p>申请时间：{c.created_at?.slice(0, 16).replace("T", " ") || "-"}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WaitlistView({
  entries,
  selectedEvent,
  onPromote,
  onRefresh,
}: {
  entries: WaitlistEntry[];
  selectedEvent: number | null;
  onPromote: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const byAge = entries.reduce<Record<string, WaitlistEntry[]>>((acc, e) => {
    (acc[e.age_group] ||= []).push(e);
    return acc;
  }, {});
  const order = ["U18", "U23", "Open"];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-5 py-3 shadow-sm">
        <div>
          <h3 className="font-semibold text-gray-800">候补队列</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            顺序号 + 缴费时间排序，入队前校验：缴费 / 证明 / 年龄
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
          <button
            disabled={!selectedEvent}
            onClick={onPromote}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <ListOrdered className="h-3.5 w-3.5" />
            手动触发递补
          </button>
        </div>
      </div>
      {!selectedEvent ? (
        <EmptyHint text="请先选择赛事" />
      ) : entries.length === 0 ? (
        <EmptyHint text="暂无候补选手" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {order.map((ag) => (
            <div key={ag} className="rounded-xl bg-white shadow-sm">
              <div
                className={`flex items-center justify-between border-b px-4 py-2.5 ${
                  ag === "U18"
                    ? "border-emerald-100 bg-emerald-50/50"
                    : ag === "U23"
                    ? "border-amber-100 bg-amber-50/50"
                    : "border-purple-100 bg-purple-50/50"
                }`}
              >
                <h4
                  className={`font-semibold ${
                    ag === "U18"
                      ? "text-emerald-700"
                      : ag === "U23"
                      ? "text-amber-700"
                      : "text-purple-700"
                  }`}
                >
                  {ag} 组
                </h4>
                <span className="text-xs text-gray-500">{(byAge[ag] || []).length} 人</span>
              </div>
              <div className="divide-y divide-gray-50 px-3 py-2">
                {(byAge[ag] || []).length === 0 ? (
                  <p className="py-4 text-center text-xs text-gray-400">暂无候补</p>
                ) : (
                  (byAge[ag] || []).map((w, i) => (
                    <div key={w.id} className="flex items-center gap-3 px-2 py-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                          i === 0
                            ? "bg-yellow-400 text-white"
                            : i === 1
                            ? "bg-gray-300 text-white"
                            : i === 2
                            ? "bg-amber-600 text-white"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {w.queue_order}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {w.player_name || `#${w.registration_id}`}
                        </p>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {w.payment_time?.slice(5, 16).replace("T", " ") || "-"}
                        </p>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          w.status === "waiting"
                            ? "bg-blue-50 text-blue-600"
                            : w.status === "promoted"
                            ? "bg-emerald-50 text-emerald-600"
                            : w.status === "skipped"
                            ? "bg-red-50 text-red-600"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {w.status === "waiting"
                          ? "等待中"
                          : w.status === "promoted"
                          ? "已递补"
                          : w.status === "skipped"
                          ? "已跳过"
                          : w.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentAdjustmentsView({
  items,
  events,
  onConfirm,
}: {
  items: PaymentAdjustment[];
  events: { id: number; name: string; fee: number }[];
  onConfirm: (id: number) => Promise<void>;
}) {
  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="font-semibold text-gray-800">差额缴费调整</h3>
        <p className="mt-0.5 text-xs text-gray-500">财务确认前，选手不得入组目标赛事</p>
      </div>
      {items.length === 0 ? (
        <EmptyHint text="暂无差额缴费记录" />
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">#</th>
              <th className="px-4 py-2.5 text-left font-medium">关联类型</th>
              <th className="px-4 py-2.5 text-left font-medium">原金额</th>
              <th className="px-4 py-2.5 text-left font-medium">新金额</th>
              <th className="px-4 py-2.5 text-left font-medium">差额</th>
              <th className="px-4 py-2.5 text-left font-medium">状态</th>
              <th className="px-4 py-2.5 text-left font-medium">时间</th>
              <th className="px-4 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-gray-700">
            {items.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5">{p.id}</td>
                <td className="px-4 py-2.5">
                  {p.adjustment_type === "project_change" ? "项目改签" : p.adjustment_type}
                </td>
                <td className="px-4 py-2.5">¥{p.original_amount}</td>
                <td className="px-4 py-2.5">¥{p.new_amount}</td>
                <td className={`px-4 py-2.5 font-medium ${p.difference > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {p.difference > 0 ? "+" : ""}¥{p.difference}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      p.finance_confirmed
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {p.finance_confirmed ? "财务已确认" : "待财务确认"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400">
                  {p.created_at?.slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!p.finance_confirmed && (
                    <button
                      onClick={() => onConfirm(p.id)}
                      className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-white hover:bg-primary-700"
                    >
                      确认
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PublishedWithdrawView({
  groups,
  onWithdraw,
  onRefresh,
}: {
  groups: GroupWithPlayers[];
  onWithdraw: (p: GroupPlayer, gId: number) => void;
  onRefresh: () => void;
}) {
  const published = groups.filter((g) => g.published);
  const totalPlayers = published.reduce((n, g) => n + g.players.filter((p) => !p.is_withdrawn).length, 0);
  const withdrawn = published.reduce((n, g) => n + g.players.filter((p) => p.is_withdrawn).length, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-5 py-3 shadow-sm">
        <div>
          <h3 className="font-semibold text-gray-800">发布后退赛管理</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            不直接移除选手，仅标记退赛并保留空位说明 → 自动候补递补
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-800">{totalPlayers}</p>
            <p className="text-[11px] text-gray-500">在组选手</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-600">{withdrawn}</p>
            <p className="text-[11px] text-gray-500">退赛空位</p>
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
        </div>
      </div>
      {published.length === 0 ? (
        <EmptyHint text="暂无已发布分组" />
      ) : (
        <div className="space-y-3">
          {published.map((g) => (
            <div key={g.id} className="rounded-xl bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-gray-800">{g.group_name}</h4>
                  <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    <Lock className="h-3 w-3" />
                    已发布
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {g.players.filter((p) => !p.is_withdrawn).length} / {g.players.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {g.players.length === 0 ? (
                  <p className="text-xs text-gray-400">无选手</p>
                ) : (
                  g.players.map((p) => (
                    <div
                      key={p.assignment_id}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                        p.is_withdrawn
                          ? "border-red-200 bg-red-50 text-red-600 line-through"
                          : "border-gray-200 bg-gray-50 text-gray-700"
                      }`}
                    >
                      <span>{p.player_name}</span>
                      <span className="rounded bg-white/60 px-1 text-[10px] opacity-70">{p.age_group}</span>
                      {p.is_withdrawn ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                          空位：{p.withdrawal_reason || "退赛"}
                        </span>
                      ) : (
                        <button
                          onClick={() => onWithdraw(p, g.id)}
                          className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-600"
                        >
                          <UserMinus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromotionLogsView({ items }: { items: PromotionLog[] }) {
  const statusColor: Record<string, string> = {
    promoted: "bg-emerald-50 text-emerald-700",
    skipped: "bg-red-50 text-red-600",
    pending: "bg-blue-50 text-blue-600",
  };
  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-3">
        <h3 className="font-semibold text-gray-800">候补递补链路日志</h3>
        <p className="mt-0.5 text-xs text-gray-500">完整的退赛→空位→候选→校验→递补/跳过链路</p>
      </div>
      {items.length === 0 ? (
        <EmptyHint text="暂无递补记录" />
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">#</th>
              <th className="px-3 py-2.5 text-left font-medium">空位来源</th>
              <th className="px-3 py-2.5 text-left font-medium">退赛原因</th>
              <th className="px-3 py-2.5 text-left font-medium">候补顺序</th>
              <th className="px-3 py-2.5 text-left font-medium">递补选手</th>
              <th className="px-3 py-2.5 text-left font-medium">状态</th>
              <th className="px-3 py-2.5 text-left font-medium">失败/备注</th>
              <th className="px-3 py-2.5 text-left font-medium">时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-gray-700">
            {items.map((l, i) => (
              <tr key={l.id} className={i % 2 ? "bg-gray-50/30" : ""}>
                <td className="px-3 py-2.5">{l.id}</td>
                <td className="px-3 py-2.5">
                  <div>
                    <p className="font-medium">
                      {l.vacated_name || `#${l.vacated_registration_id}`}
                    </p>
                    <p className="text-[11px] text-gray-400">Slot #{l.vacated_slot_number}</p>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">
                  {l.vacated_reason || "-"}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold">
                    #{l.queue_order || "-"}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-medium">
                  {l.promoted_name || (l.promoted_registration_id ? `#${l.promoted_registration_id}` : "-")}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${statusColor[l.status] || "bg-gray-100 text-gray-600"}`}>
                    {l.status === "promoted" ? "✓ 递补成功" : l.status === "skipped" ? "✗ 跳过" : l.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-red-500 max-w-[180px] truncate">
                  {l.failure_reason || "-"}
                </td>
                <td className="px-3 py-2.5 text-gray-400">
                  {l.created_at?.slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

