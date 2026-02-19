import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, ChevronRight, Bot } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

function AssistantCard({ assistant, onDelete, onTap }) {
  const pressTimer = useRef(null);
  const didLongPress = useRef(false);
  const moved = useRef(false);

  const onPressStart = () => {
    didLongPress.current = false;
    moved.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onDelete(assistant);
    }, 600);
  };

  const onPressMove = () => {
    moved.current = true;
    clearTimeout(pressTimer.current);
  };

  const onPressEnd = () => {
    clearTimeout(pressTimer.current);
    if (!didLongPress.current && !moved.current) onTap(assistant);
    didLongPress.current = false;
    moved.current = false;
  };

  return (
    <div className="mb-3">
      <div
        className="flex items-center gap-3 rounded-[18px] p-4"
        style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", userSelect: "none" }}
        onTouchStart={onPressStart}
        onTouchMove={onPressMove}
        onTouchEnd={onPressEnd}
        onMouseDown={onPressStart}
        onMouseMove={onPressMove}
        onMouseUp={onPressEnd}
        onMouseLeave={() => clearTimeout(pressTimer.current)}
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ boxShadow: "var(--card-shadow-sm)", background: S.bg }}
        >
          {assistant.avatar_url ? (
            <img src={assistant.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[20px]" style={{ color: S.accentDark }}>
              {assistant.name?.[0] || "?"}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-[15px] font-bold" style={{ color: S.text }}>
            {assistant.name}
          </div>
          {assistant.created_at && (
            <div className="mt-0.5 truncate text-[11px]" style={{ color: S.textMuted }}>
              {assistant.created_at.slice(0, 10)}
            </div>
          )}
        </div>
        <ChevronRight size={16} style={{ color: S.textMuted, flexShrink: 0 }} />
      </div>
    </div>
  );
}

export default function Assistants() {
  const navigate = useNavigate();
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const load = () => {
    setLoading(true);
    apiFetch("/api/assistants")
      .then((d) => setAssistants(d.assistants || []))
      .catch(() => showToast("加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (a) => {
    setDeleteTarget(null);
    try {
      await apiFetch(`/api/assistants/${a.id}`, { method: "DELETE" });
      setAssistants((prev) => prev.filter((x) => x.id !== a.id));
      showToast("已删除");
    } catch {
      showToast("删除失败");
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-5 pb-4"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
          onClick={() => navigate("/")}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>助手配置</h1>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
          onClick={() => navigate("/assistants/new")}
        >
          <Plus size={20} style={{ color: S.accentDark }} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2"
              style={{ borderColor: S.accent, borderTopColor: "transparent" }}
            />
          </div>
        ) : assistants.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <Bot size={36} style={{ color: S.textMuted, opacity: 0.5 }} />
            <p className="text-[14px]" style={{ color: S.textMuted }}>
              还没有助手，点击 + 创建
            </p>
          </div>
        ) : (
          assistants.map((a) => (
            <AssistantCard
              key={a.id}
              assistant={a}
              onDelete={(x) => setDeleteTarget(x)}
              onTap={(x) => navigate(`/assistants/${x.id}`)}
            />
          ))
        )}
      </div>

      {/* Delete confirm */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.25)" }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full rounded-t-[28px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            style={{ background: S.bg, boxShadow: "0 -4px 20px rgba(0,0,0,0.12)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-center text-[16px] font-bold" style={{ color: S.text }}>
              删除助手
            </p>
            <p className="mb-6 text-center text-[13px]" style={{ color: S.textMuted }}>
              确定要删除「{deleteTarget.name}」吗？
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-[16px] py-3 text-[15px] font-semibold"
                style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.text }}
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                className="flex-1 rounded-[16px] py-3 text-[15px] font-semibold text-white"
                style={{ background: "#ff4d6d", boxShadow: "4px 4px 10px rgba(255,77,109,0.4)" }}
                onClick={() => handleDelete(deleteTarget)}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-1/2 z-[200] flex justify-center">
          <div className="rounded-2xl px-6 py-3 text-[14px] font-medium text-white" style={{ background: "rgba(0,0,0,0.75)" }}>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
