import { useEffect, useState, useCallback, useMemo } from "react";
import { useStore } from "@/store";
import type { Registration, GroupWithPlayers, GroupPlayer } from "@/store";
import {
  LayoutGrid,
  GripVertical,
  Send,
  Lock,
  AlertCircle,
  Users,
  X,
  Info,
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

function extractAgeGroup(groupName: string): string {
  const parts = groupName.split("-");
  return parts[parts.length - 1];
}

function validateAgeGroupMatch(
  regAgeGroup: string,
  groupAgeGroup: string,
  playerName: string
): string | null {
  if (regAgeGroup === groupAgeGroup) {
    return null;
  }

  const allowedTransitions: Record<string, string[]> = {
    U18: ["U18"],
    U23: ["U23"],
    Open: ["Open"],
  };

  const allowed = allowedTransitions[regAgeGroup] || [];
  if (!allowed.includes(groupAgeGroup)) {
    if (regAgeGroup === "U23" && (groupAgeGroup === "Open" || groupAgeGroup === "U18")) {
      return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（U23选手仅能进入U23分组，不能进入Open或U18分组）`;
    }
    if (regAgeGroup === "Open" && (groupAgeGroup === "U23" || groupAgeGroup === "U18")) {
      return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（Open选手仅能进入Open分组，不能进入U23或U18分组）`;
    }
    if (regAgeGroup === "U18" && (groupAgeGroup === "U23" || groupAgeGroup === "Open")) {
      return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（U18选手仅能进入U18分组，不能进入U23或Open分组）`;
    }
    return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（年龄组不匹配）`;
  }

  return null;
}

interface ValidationError {
  message: string;
  details?: string[];
}

export default function Grouping() {
  const {
    events,
    eligiblePlayers,
    allGroups,
    fetchEvents,
    fetchEligiblePlayers,
    fetchAllGroups,
    assignToGroup,
    publishGroups,
    loading,
  } = useStore();

  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [activePlayer, setActivePlayer] = useState<Registration | null>(null);
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const sensors = useSensors(pointerSensor);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (selectedEvent) {
      fetchEligiblePlayers(selectedEvent);
      fetchAllGroups(selectedEvent);
      setValidationError(null);
    }
  }, [selectedEvent, fetchEligiblePlayers, fetchAllGroups]);

  const eventGroups = useMemo(
    () => allGroups.filter((g) => g.event_id === selectedEvent),
    [allGroups, selectedEvent]
  );

  const canDropIntoGroup = useCallback(
    (player: Registration, group: GroupWithPlayers): { canDrop: boolean; reason?: string } => {
      if (group.published) {
        return { canDrop: false, reason: "该分组已发布，无法添加选手" };
      }

      const groupAgeGroup = extractAgeGroup(group.group_name);
      const ageError = validateAgeGroupMatch(player.age_group, groupAgeGroup, player.player_name);
      if (ageError) {
        return { canDrop: false, reason: ageError };
      }

      return { canDrop: true };
    },
    []
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as number;
    const player = eligiblePlayers.find((p) => p.id === id);
    if (player) setActivePlayer(player);
    setValidationError(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over || !activePlayer) {
      setHoveredGroup(null);
      return;
    }

    const overId = String(over.id);
    if (overId.startsWith("group-")) {
      const groupId = Number(overId.replace("group-", ""));
      setHoveredGroup(groupId);
    } else {
      setHoveredGroup(null);
    }
  };

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActivePlayer(null);
      setHoveredGroup(null);
      const { active, over } = event;
      if (!over || !selectedEvent) return;

      const playerId = active.id as number;
      const overId = String(over.id);

      if (!overId.startsWith("group-")) {
        return;
      }

      const groupId = Number(overId.replace("group-", ""));
      const targetGroup = eventGroups.find((g) => g.id === groupId);
      const player = eligiblePlayers.find((p) => p.id === playerId);

      if (!targetGroup || !player) {
        return;
      }

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
        setValidationError({
          message: "年龄组校验失败",
          details: [ageCheck],
        });
        return;
      }

      try {
        await assignToGroup(groupId, [playerId]);
        await fetchEligiblePlayers(selectedEvent);
        await fetchAllGroups(selectedEvent);
        setValidationError(null);
      } catch (err: any) {
        let details: string[] | undefined = undefined;
        if (err.message && err.message.includes("分组分配失败")) {
          details = err.details;
        }
        setValidationError({
          message: err.message || "分组失败",
          details,
        });
      }
    },
    [selectedEvent, eventGroups, eligiblePlayers, assignToGroup, fetchEligiblePlayers, fetchAllGroups]
  );

  const handlePublish = async (groupId: number) => {
    if (!confirm("确认发布此分组？发布后无法再调整选手。")) return;
    try {
      await publishGroups([groupId]);
      if (selectedEvent) {
        await fetchAllGroups(selectedEvent);
        await fetchEligiblePlayers(selectedEvent);
      }
      setValidationError(null);
    } catch (err: any) {
      let details: string[] | undefined = undefined;
      if (err.message && err.message.includes("发布失败")) {
        details = err.details;
      }
      setValidationError({
        message: err.message || "发布失败",
        details,
      });
    }
  };

  const dismissError = () => setValidationError(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-primary">裁判分组</h2>
        </div>
        <select
          className="input-field w-64"
          value={selectedEvent ?? ""}
          onChange={(e) =>
            setSelectedEvent(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">请选择赛事</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
      </div>

      {validationError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="font-medium">{validationError.message}</p>
              {validationError.details && validationError.details.length > 0 && (
                <ul className="mt-2 space-y-1 pl-1 text-red-600">
                  {validationError.details.map((d, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-red-400">•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={dismissError}
              className="text-red-400 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>拖拽左侧选手到对应年龄组分组。U18选手仅能进入U18分组，U23选手仅能进入U23分组，Open选手仅能进入Open分组。</span>
        </div>
      )}

      {!selectedEvent ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm">
          <LayoutGrid className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-400">请先选择赛事</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
            <PlayerPool players={eligiblePlayers} />
            <GroupsPanel
              groups={eventGroups}
              onPublish={handlePublish}
              loading={loading}
              activePlayer={activePlayer}
              canDropIntoGroup={canDropIntoGroup}
              hoveredGroup={hoveredGroup}
            />
          </div>

          <DragOverlay dropAnimation={null}>
            {activePlayer ? (
              <div className="flex items-center gap-2 rounded-lg border-2 border-accent bg-white px-3 py-2 shadow-lg">
                <GripVertical className="h-4 w-4 text-accent" />
                <span className="font-medium text-gray-800">{activePlayer.player_name}</span>
                <span className="rounded bg-primary-100 px-1.5 py-0.5 text-xs font-medium text-primary-700">
                  {activePlayer.age_group}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function PlayerPool({ players }: { players: Registration[] }) {
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
            <DraggablePlayerCard key={p.id} player={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggablePlayerCard({ player }: { player: Registration }) {
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
      className={`flex cursor-grab items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition-all hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="h-4 w-4 text-gray-400" />
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{player.player_name}</p>
        <p className="text-xs text-gray-400">
          {player.id_number.slice(0, 8)}***
        </p>
      </div>
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
          ageGroupColor[player.age_group] || "bg-gray-100 text-gray-600"
        }`}
      >
        {player.age_group}
      </span>
    </div>
  );
}

interface GroupsPanelProps {
  groups: GroupWithPlayers[];
  onPublish: (groupId: number) => void;
  loading: boolean;
  activePlayer: Registration | null;
  canDropIntoGroup: (
    player: Registration,
    group: GroupWithPlayers
  ) => { canDrop: boolean; reason?: string };
  hoveredGroup: number | null;
}

function GroupsPanel({
  groups,
  onPublish,
  loading,
  activePlayer,
  canDropIntoGroup,
  hoveredGroup,
}: GroupsPanelProps) {
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
      {groups.map((group) => {
        const dropCheck =
          activePlayer && hoveredGroup === group.id
            ? canDropIntoGroup(activePlayer, group)
            : { canDrop: true };
        return (
          <GroupCard
            key={group.id}
            group={group}
            onPublish={onPublish}
            loading={loading}
            dropCheck={dropCheck}
            isHovered={hoveredGroup === group.id}
            activePlayer={activePlayer}
          />
        );
      })}
    </div>
  );
}

interface GroupCardProps {
  group: GroupWithPlayers;
  onPublish: (groupId: number) => void;
  loading: boolean;
  dropCheck: { canDrop: boolean; reason?: string };
  isHovered: boolean;
  activePlayer: Registration | null;
}

function GroupCard({
  group,
  onPublish,
  loading,
  dropCheck,
  isHovered,
  activePlayer,
}: GroupCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${group.id}`,
    data: { type: "group", group },
    disabled: !!group.published,
  });

  const groupAgeGroup = extractAgeGroup(group.group_name);

  const ageGroupColor: Record<string, string> = {
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
          ? ageGroupColor[groupAgeGroup] || "border-accent bg-accent-50/30"
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
              groupAgeGroup === "U18"
                ? "bg-emerald-100 text-emerald-700"
                : groupAgeGroup === "U23"
                ? "bg-amber-100 text-amber-700"
                : "bg-purple-100 text-purple-700"
            }`}
          >
            {groupAgeGroup}
          </span>
          {group.published ? (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              <Lock className="h-3 w-3" />
              已发布
            </span>
          ) : (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
              编排中
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {group.players.filter((p) => !p.is_withdrawn).length} 人
        </span>
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

function PlayerChip({ player, locked }: { player: GroupPlayer; locked: boolean }) {
  const ageGroupColor: Record<string, string> = {
    U18: "border-emerald-200 bg-emerald-50 text-emerald-700",
    U23: "border-amber-200 bg-amber-50 text-amber-700",
    Open: "border-purple-200 bg-purple-50 text-purple-700",
  };

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        player.is_withdrawn
          ? "border-gray-200 bg-gray-50 text-gray-400 line-through"
          : locked
          ? "border-gray-200 bg-gray-50 text-gray-600"
          : ageGroupColor[player.age_group] || "border-gray-200 bg-gray-50 text-gray-600"
      }`}
    >
      <span>{player.player_name}</span>
      <span className="rounded bg-white/60 px-1 text-[10px] font-medium opacity-70">
        {player.age_group}
      </span>
      {player.is_withdrawn && (
        <span className="text-[10px] text-red-400">
          退赛: {player.withdrawal_reason}
        </span>
      )}
    </div>
  );
}
