import { useEffect, useState, useCallback } from "react";
import { useStore } from "@/store";
import type { Registration, GroupWithPlayers, GroupPlayer } from "@/store";
import {
  LayoutGrid,
  GripVertical,
  Send,
  Lock,
  AlertCircle,
  Users,
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    }
  }, [selectedEvent, fetchEligiblePlayers, fetchAllGroups]);

  const eventGroups = allGroups.filter(
    (g) => g.event_id === selectedEvent
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as number;
    const player = eligiblePlayers.find((p) => p.id === id);
    if (player) setActivePlayer(player);
    setErrorMsg(null);
  };

  const handleDragOver = (_event: DragOverEvent) => {};

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActivePlayer(null);
      const { active, over } = event;
      if (!over || !selectedEvent) return;

      const playerId = active.id as number;
      const overId = String(over.id);

      if (!overId.startsWith("group-")) {
        return;
      }

      const groupId = Number(overId.replace("group-", ""));
      const targetGroup = eventGroups.find((g) => g.id === groupId);

      if (targetGroup?.published) {
        setErrorMsg("该分组已发布，无法添加选手");
        return;
      }

      try {
        await assignToGroup(groupId, [playerId]);
        await fetchEligiblePlayers(selectedEvent);
        await fetchAllGroups(selectedEvent);
      } catch (err: any) {
        setErrorMsg(err.message || "分组失败");
      }
    },
    [selectedEvent, eventGroups, assignToGroup, fetchEligiblePlayers, fetchAllGroups]
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
      setErrorMsg(err.message || "发布失败");
    }
  };

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

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {errorMsg}
          <button className="ml-auto" onClick={() => setErrorMsg(null)}>
            ×
          </button>
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
            />
          </div>

          <DragOverlay dropAnimation={null}>
            {activePlayer ? (
              <div className="flex items-center gap-2 rounded-lg border-2 border-accent bg-white px-3 py-2 shadow-lg">
                <GripVertical className="h-4 w-4 text-accent" />
                <span className="font-medium text-gray-800">{activePlayer.player_name}</span>
                <span className="text-xs text-gray-400">{activePlayer.age_group}</span>
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
        <div className="max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto">
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

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition-shadow hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="h-4 w-4 text-gray-400" />
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{player.player_name}</p>
        <p className="text-xs text-gray-400">
          {player.id_number} · {player.age_group}
        </p>
      </div>
    </div>
  );
}

function GroupsPanel({
  groups,
  onPublish,
  loading,
}: {
  groups: GroupWithPlayers[];
  onPublish: (groupId: number) => void;
  loading: boolean;
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
      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          onPublish={onPublish}
          loading={loading}
        />
      ))}
    </div>
  );
}

function GroupCard({
  group,
  onPublish,
  loading,
}: {
  group: GroupWithPlayers;
  onPublish: (groupId: number) => void;
  loading: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${group.id}`,
    data: { type: "group", group },
    disabled: !!group.published,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 bg-white shadow-sm transition-colors ${
        isOver && !group.published
          ? "border-accent bg-accent-50/30"
          : group.published
          ? "border-gray-200"
          : "border-gray-100"
      }`}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-gray-800">{group.group_name}</h4>
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
        <span className="text-xs text-gray-400">{group.players.length} 人</span>
      </div>

      <div className="min-h-[60px] px-4 py-3">
        {group.players.length === 0 ? (
          <p className="py-2 text-center text-xs text-gray-300">拖入选手到此处</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {group.players.map((p) => (
              <PlayerChip key={p.assignment_id} player={p} locked={!!group.published} />
            ))}
          </div>
        )}
      </div>

      {!group.published && (
        <div className="border-t border-gray-50 px-4 py-3">
          <button
            onClick={() => onPublish(group.id)}
            disabled={loading || group.players.length === 0}
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
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        player.is_withdrawn
          ? "border-gray-200 bg-gray-50 text-gray-400 line-through"
          : locked
          ? "border-gray-200 bg-gray-50 text-gray-600"
          : "border-primary-100 bg-primary-50 text-primary"
      }`}
    >
      {player.player_name}
      <span className="text-[10px] opacity-60">{player.age_group}</span>
    </div>
  );
}
