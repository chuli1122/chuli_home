import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { apiFetch } from "../../utils/api";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";

export default function Contacts() {
  const navigate = useNavigate();
  const [assistants, setAssistants] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [swipedId, setSwipedId] = useState(null);
  const [blocked, setBlocked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("blocked-assistants") || "[]");
    } catch {
      return [];
    }
  });
  // Delete confirmation chain
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteStep, setDeleteStep] = useState(0);
  // Block confirmation
  const [blockTarget, setBlockTarget] = useState(null);

  const touchRef = useRef({ startX: 0, id: null });

  const load = async () => {
    try {
      const data = await apiFetch("/api/assistants");
      setAssistants(data.assistants || []);
    } catch (e) {
      console.error("Failed to load assistants", e);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createAssistant = async () => {
    if (!newName.trim()) return;
    try {
      const data = await apiFetch("/api/assistants", {
        method: "POST",
        body: { name: newName.trim() },
      });
      setShowCreate(false);
      setNewName("");
      navigate(`/chat/assistant/${data.id}`);
    } catch (e) {
      console.error("Failed to create assistant", e);
    }
  };

  const toggleBlock = (assistant) => {
    if (blocked.includes(assistant.id)) {
      const next = blocked.filter((id) => id !== assistant.id);
      setBlocked(next);
      localStorage.setItem("blocked-assistants", JSON.stringify(next));
      setSwipedId(null);
    } else {
      setBlockTarget(assistant);
    }
  };

  const confirmBlock = () => {
    if (!blockTarget) return;
    const next = [...blocked, blockTarget.id];
    setBlocked(next);
    localStorage.setItem("blocked-assistants", JSON.stringify(next));
    setBlockTarget(null);
    setSwipedId(null);
  };

  const startDelete = (assistant) => {
    setDeleteTarget(assistant);
    setDeleteStep(1);
  };

  const deleteMessages = [
    "",
    "确定要删除助手 {name} 吗？",
    "删除后该助手的所有聊天记录和记忆都将丢失，且无法恢复。确定继续吗？",
    "最后确认：真的要永久删除 {name} 吗？这个操作不可撤销。",
  ];

  const confirmDelete = async () => {
    if (deleteStep < 3) {
      setDeleteStep(deleteStep + 1);
      return;
    }
    // Final delete
    try {
      await apiFetch(`/api/assistants/${deleteTarget.id}`, {
        method: "DELETE",
      });
      setDeleteTarget(null);
      setDeleteStep(0);
      setSwipedId(null);
      load();
    } catch (e) {
      console.error("Failed to delete assistant", e);
    }
  };

  const handleTouchStart = (e, id) => {
    touchRef.current = { startX: e.touches[0].clientX, id };
  };

  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchRef.current.startX;
    if (dx < -50) {
      setSwipedId(touchRef.current.id);
    } else if (dx > 30) {
      setSwipedId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end px-4 pb-2">
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-full p-1.5 active:bg-black/5"
        >
          <Plus size={22} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {assistants.length === 0 && (
          <p className="mt-12 text-center text-sm text-gray-400">
            暂无助手，点击 + 创建
          </p>
        )}
        {assistants.map((a) => {
          const isSwiped = swipedId === a.id;
          const isBlocked = blocked.includes(a.id);
          return (
            <div
              key={a.id}
              className="relative overflow-hidden rounded-xl mb-1"
            >
              {/* Action buttons behind */}
              <div className="absolute right-0 top-0 bottom-0 flex items-stretch">
                <button
                  onClick={() => toggleBlock(a)}
                  className={`flex w-16 items-center justify-center text-xs text-white ${
                    isBlocked ? "bg-green-500" : "bg-orange-400"
                  }`}
                >
                  {isBlocked ? "取消拉黑" : "拉黑"}
                </button>
                <button
                  onClick={() => startDelete(a)}
                  className="flex w-16 items-center justify-center text-xs text-white bg-red-500"
                >
                  删除
                </button>
              </div>

              {/* Main row */}
              <div
                className={`relative flex items-center gap-3 rounded-xl bg-white px-3 py-3 transition-transform duration-200 ${
                  isSwiped ? "-translate-x-32" : "translate-x-0"
                }`}
                onTouchStart={(e) => handleTouchStart(e, a.id)}
                onTouchEnd={handleTouchEnd}
                onClick={() => !isSwiped && navigate(`/chat/assistant/${a.id}`)}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg">
                  {a.name[0]}
                </div>
                <span className="text-sm font-medium">{a.name}</span>
                {isBlocked && (
                  <span className="ml-auto text-[10px] text-red-400 bg-red-50 px-1.5 py-0.5 rounded">
                    已拉黑
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create assistant modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          setNewName("");
        }}
        title="创建助手"
        onConfirm={createAssistant}
        confirmText="保存"
        isConfirmDisabled={!newName.trim()}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="输入助手名称"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          autoFocus
        />
      </Modal>

      {/* Block confirm */}
      <ConfirmModal
        isOpen={blockTarget !== null}
        onClose={() => setBlockTarget(null)}
        onConfirm={confirmBlock}
        title="拉黑"
        message={
          blockTarget
            ? `确定要拉黑 ${blockTarget.name} 吗？拉黑后对方发送的消息会被标记`
            : ""
        }
      />

      {/* Delete chain confirm */}
      <ConfirmModal
        isOpen={deleteTarget !== null && deleteStep > 0}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteStep(0);
        }}
        onConfirm={confirmDelete}
        title="删除助手"
        message={
          deleteTarget
            ? deleteMessages[deleteStep]?.replace("{name}", deleteTarget.name)
            : ""
        }
        confirmText={deleteStep < 3 ? "继续" : "永久删除"}
      />
    </div>
  );
}
