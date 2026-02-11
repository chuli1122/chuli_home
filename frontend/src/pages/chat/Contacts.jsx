import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, Trash2 } from "lucide-react";
import { apiFetch } from "../../utils/api";
import ConfirmModal from "../../components/ConfirmModal";

const ACTION_WIDTH = 172;
const SNAP_THRESHOLD = 56;

function SwipeRow({ children, onBlock, onDelete, isBlocked }) {
  const rowRef = useRef(null);
  const state = useRef({
    startX: 0,
    startY: 0,
    base: 0,       // offset at touch start
    current: 0,    // live offset
    dragging: false,
    dirLocked: false, // true once we know horizontal vs vertical
    isHorizontal: false,
  });

  const applyTranslate = (x, animate) => {
    const el = rowRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.3s cubic-bezier(.4,0,.2,1)" : "none";
    el.style.transform = `translateX(${x}px)`;
    state.current.current = x;
  };

  const close = useCallback(() => applyTranslate(0, true), []);

  const onTouchStart = (e) => {
    const t = e.touches[0];
    const s = state.current;
    s.startX = t.clientX;
    s.startY = t.clientY;
    s.base = s.current;
    s.dragging = true;
    s.dirLocked = false;
    s.isHorizontal = false;
    const el = rowRef.current;
    if (el) el.style.transition = "none";
  };

  const onTouchMove = (e) => {
    const s = state.current;
    if (!s.dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;

    // Lock direction on first significant move
    if (!s.dirLocked) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      s.dirLocked = true;
      s.isHorizontal = Math.abs(dx) > Math.abs(dy);
    }

    if (!s.isHorizontal) {
      // Vertical → let scroll handle it
      s.dragging = false;
      return;
    }

    // Horizontal swipe — prevent scroll
    e.preventDefault();
    let next = s.base + dx;
    next = Math.max(-ACTION_WIDTH, Math.min(0, next));
    const el = rowRef.current;
    if (el) el.style.transform = `translateX(${next}px)`;
    s.current = next;
  };

  const onTouchEnd = () => {
    const s = state.current;
    s.dragging = false;
    if (s.current < -SNAP_THRESHOLD) {
      applyTranslate(-ACTION_WIDTH, true);
    } else {
      applyTranslate(0, true);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[24px]">
      {/* Action buttons — Kelivo style */}
      <div className="absolute right-0 top-0 bottom-0 flex items-center gap-2 pr-2.5">
        <button
          onClick={() => { close(); onBlock(); }}
          className="flex h-[calc(100%-16px)] w-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-gray-50 active:bg-gray-100 transition"
        >
          <Ban size={18} className="text-gray-500" />
          <span className="text-[11px] font-medium text-gray-500">
            {isBlocked ? "取消拉黑" : "拉黑"}
          </span>
        </button>
        <button
          onClick={() => { close(); onDelete(); }}
          className="flex h-[calc(100%-16px)] w-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 active:bg-red-100 transition"
        >
          <Trash2 size={18} className="text-red-500" />
          <span className="text-[11px] font-medium text-red-500">删除</span>
        </button>
      </div>

      {/* Main card — slides with finger */}
      <div
        ref={rowRef}
        className="relative z-10 rounded-[24px] bg-white shadow-sm"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: "translateX(0px)", willChange: "transform" }}
      >
        {children}
      </div>
    </div>
  );
}

export default function Contacts() {
  const navigate = useNavigate();
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("blocked-assistants") || "[]");
    } catch { return []; }
  });

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteStep, setDeleteStep] = useState(0);
  const [blockTarget, setBlockTarget] = useState(null);

  const load = async () => {
    try {
      const data = await apiFetch("/api/assistants");
      setAssistants(data.assistants || []);
    } catch (e) {
      console.error("Failed to load assistants", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleBlock = (assistant) => {
    if (blocked.includes(assistant.id)) {
      const next = blocked.filter((id) => id !== assistant.id);
      setBlocked(next);
      localStorage.setItem("blocked-assistants", JSON.stringify(next));
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
    try {
      await apiFetch(`/api/assistants/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setDeleteStep(0);
      load();
    } catch (e) {
      console.error("Failed to delete assistant", e);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 pb-24">
        {assistants.length === 0 && (
          <p className="mt-16 text-center text-sm text-gray-400">
            暂无助手，点击右上角 + 创建
          </p>
        )}
        <div className="flex flex-col gap-4">
          {assistants.map((a) => {
            const isBlocked = blocked.includes(a.id);
            return (
              <SwipeRow
                key={a.id}
                isBlocked={isBlocked}
                onBlock={() => toggleBlock(a)}
                onDelete={() => startDelete(a)}
              >
                <div
                  className="flex items-center gap-4 p-5"
                  onClick={() => navigate(`/chat/assistant/${a.id}`)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F5F5F7] text-gray-500 text-[15px] font-medium">
                    {a.name[0]}
                  </div>
                  <span className="text-[15px] font-medium">{a.name}</span>
                  {isBlocked && (
                    <span className="ml-auto text-[10px] text-red-400 bg-red-50 px-2 py-0.5 rounded-full">
                      已拉黑
                    </span>
                  )}
                </div>
              </SwipeRow>
            );
          })}
        </div>
      </div>

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
        onClose={() => { setDeleteTarget(null); setDeleteStep(0); }}
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
