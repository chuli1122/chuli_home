import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, Trash2 } from "lucide-react";
import { apiFetch } from "../../utils/api";
import ConfirmModal from "../../components/ConfirmModal";

const ACTION_WIDTH = 140;
const SNAP_THRESHOLD = 50;

function SwipeRow({ children, onBlock, onDelete, isBlocked }) {
  const rowRef = useRef(null);
  const actionsRef = useRef(null);
  const state = useRef({
    startX: 0, startY: 0, base: 0, current: 0,
    dragging: false, dirLocked: false, isHorizontal: false,
  });

  const applyTranslate = (x, animate) => {
    const el = rowRef.current;
    const act = actionsRef.current;
    if (!el) return;
    const ease = animate ? "all 0.3s cubic-bezier(.4,0,.2,1)" : "none";
    el.style.transition = ease;
    el.style.transform = `translateX(${x}px)`;
    if (act) {
      const progress = Math.min(1, Math.abs(x) / ACTION_WIDTH);
      act.style.transition = ease;
      act.style.transform = `translateX(${(1 - progress) * 40}px)`;
      act.style.opacity = `${progress}`;
    }
    state.current.current = x;
  };

  const close = useCallback(() => applyTranslate(0, true), []);

  const onTouchStart = (e) => {
    const t = e.touches[0];
    const s = state.current;
    s.startX = t.clientX; s.startY = t.clientY;
    s.base = s.current; s.dragging = true;
    s.dirLocked = false; s.isHorizontal = false;
    if (rowRef.current) rowRef.current.style.transition = "none";
    if (actionsRef.current) actionsRef.current.style.transition = "none";
  };

  const onTouchMove = (e) => {
    const s = state.current;
    if (!s.dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    if (!s.dirLocked) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      s.dirLocked = true;
      s.isHorizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!s.isHorizontal) { s.dragging = false; return; }
    e.preventDefault();
    let next = Math.max(-ACTION_WIDTH, Math.min(0, s.base + dx));
    const el = rowRef.current;
    const act = actionsRef.current;
    if (el) el.style.transform = `translateX(${next}px)`;
    if (act) {
      const progress = Math.min(1, Math.abs(next) / ACTION_WIDTH);
      act.style.transform = `translateX(${(1 - progress) * 40}px)`;
      act.style.opacity = `${progress}`;
    }
    s.current = next;
  };

  const onTouchEnd = () => {
    const s = state.current;
    s.dragging = false;
    if (s.current < -SNAP_THRESHOLD) applyTranslate(-ACTION_WIDTH, true);
    else applyTranslate(0, true);
  };

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      <div
        ref={actionsRef}
        className="absolute right-0 top-0 bottom-0 flex items-center gap-1.5 pr-2"
        style={{ opacity: 0, transform: "translateX(40px)" }}
      >
        <button
          onClick={() => { close(); onBlock(); }}
          className="flex h-[calc(100%-14px)] w-[62px] flex-col items-center justify-center gap-1 rounded-xl"
          style={{ background: "var(--chat-input-bg)", border: "1px solid var(--chat-accent)" }}
        >
          <Ban size={16} style={{ color: "var(--chat-text-muted)" }} />
          <span className="text-[10px] font-medium" style={{ color: "var(--chat-text-muted)" }}>
            {isBlocked ? "取消" : "拉黑"}
          </span>
        </button>
        <button
          onClick={() => { close(); onDelete(); }}
          className="flex h-[calc(100%-14px)] w-[62px] flex-col items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 active:bg-red-100"
        >
          <Trash2 size={16} className="text-red-500" />
          <span className="text-[10px] font-medium text-red-500">删除</span>
        </button>
      </div>

      <div
        ref={rowRef}
        className="relative z-10 rounded-[20px]"
        style={{ background: "var(--chat-card-bg)" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        {...{ style: { background: "var(--chat-card-bg)", transform: "translateX(0px)", willChange: "transform" } }}
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
        <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "var(--chat-accent)", borderTopColor: "var(--chat-accent-dark)" }} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {assistants.length === 0 && (
          <p className="mt-16 text-center text-sm" style={{ color: "var(--chat-text-muted)" }}>
            暂无助手，点击右上角 + 创建
          </p>
        )}
        <div className="flex flex-col gap-3">
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
                  className="flex items-center gap-4 p-4"
                  onClick={() => navigate(`/chat/assistant/${a.id}`, { replace: true })}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-medium"
                    style={{ background: "var(--chat-input-bg)", color: "var(--chat-accent-dark)" }}
                  >
                    {a.name[0]}
                  </div>
                  <span className="text-[15px] font-medium" style={{ color: "var(--chat-text)" }}>{a.name}</span>
                  {isBlocked && (
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{ color: "#e05080", background: "#fce0e8" }}>
                      已拉黑
                    </span>
                  )}
                </div>
              </SwipeRow>
            );
          })}
        </div>
      </div>

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
