import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { loadImageUrl } from "../../utils/db";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";

const ACTION_WIDTH = 80;
const SNAP_THRESHOLD = 40;

function SwipeDeleteRow({ children, onDelete }) {
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

  return (
    <div className="relative overflow-hidden rounded-[20px]">
      <div
        ref={actionsRef}
        className="absolute right-0 top-0 bottom-0 flex items-center pr-2"
        style={{ opacity: 0, transform: "translateX(40px)" }}
      >
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
        style={{ background: "var(--chat-card-bg)", transform: "translateX(0px)", willChange: "transform" }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          const s = state.current;
          s.startX = t.clientX; s.startY = t.clientY;
          s.base = s.current; s.dragging = true;
          s.dirLocked = false; s.isHorizontal = false;
          if (rowRef.current) rowRef.current.style.transition = "none";
          if (actionsRef.current) actionsRef.current.style.transition = "none";
        }}
        onTouchMove={(e) => {
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
          const next = Math.max(-ACTION_WIDTH, Math.min(0, s.base + dx));
          const el = rowRef.current;
          const act = actionsRef.current;
          if (el) el.style.transform = `translateX(${next}px)`;
          if (act) {
            const progress = Math.min(1, Math.abs(next) / ACTION_WIDTH);
            act.style.transform = `translateX(${(1 - progress) * 40}px)`;
            act.style.opacity = `${progress}`;
          }
          s.current = next;
        }}
        onTouchEnd={() => {
          const s = state.current;
          s.dragging = false;
          if (s.current < -SNAP_THRESHOLD) applyTranslate(-ACTION_WIDTH, true);
          else applyTranslate(0, true);
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function MessageList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [previews, setPreviews] = useState({});
  const [avatarUrls, setAvatarUrls] = useState({});
  const [loading, setLoading] = useState(true);

  const [assistants, setAssistants] = useState([]);
  const [selectMode, setSelectMode] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // Rename session
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const longPressTimer = useRef(null);

  // Delete session
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    try {
      const data = await apiFetch("/api/sessions");
      const list = (data.sessions || []).sort(
        (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
      );
      setSessions(list);
      const previewMap = {};
      const avatarMap = {};
      await Promise.all(
        list.map(async (s) => {
          try {
            // Load message preview
            const msgData = await apiFetch(`/api/sessions/${s.id}/messages?limit=10`);
            const msgs = msgData.messages || [];
            // Messages are in ascending order (oldest first), so get the last one
            if (msgs.length > 0) previewMap[s.id] = msgs[msgs.length - 1];

            // Load assistant avatar for single chat
            if (s.assistant_id && s.type === 'chat') {
              try {
                const assistantData = await apiFetch(`/api/assistants/${s.assistant_id}`);
                if (assistantData.avatar_url) {
                  const url = await loadImageUrl(assistantData.avatar_url);
                  if (url) avatarMap[s.id] = url;
                }
              } catch {}
            }
          } catch {}
        })
      );
      setPreviews(previewMap);
      setAvatarUrls(avatarMap);
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const action = location.state?.action;
    if (action === "chat" || action === "group") {
      openSelect(action);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  const openSelect = async (mode) => {
    try {
      const data = await apiFetch("/api/assistants");
      setAssistants(data.assistants || []);
    } catch {}
    setSelectMode(mode);
    setSelectedIds([]);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const createSession = async () => {
    try {
      let body;
      if (selectMode === "chat") {
        if (selectedIds.length !== 1) return;
        const chosen = assistants.find((a) => a.id === selectedIds[0]);
        body = { assistant_id: selectedIds[0], type: "chat", title: chosen?.name || "" };
      } else {
        if (selectedIds.length < 2) return;
        const names = selectedIds.map((aid) => assistants.find((a) => a.id === aid)?.name || "").filter(Boolean).join("、");
        body = { assistant_ids: selectedIds, type: "group", title: names || "群聊" };
      }
      const data = await apiFetch("/api/sessions", { method: "POST", body });
      setSelectMode(null);
      navigate(`/chat/session/${data.id}`, { replace: true });
    } catch (e) {
      console.error("Failed to create session", e);
    }
  };

  // Long press rename
  const startLongPress = (session) => {
    longPressTimer.current = setTimeout(() => {
      setRenameTarget(session);
      setRenameValue(session.title || "");
    }, 600);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const confirmRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await apiFetch(`/api/sessions/${renameTarget.id}`, { method: "PUT", body: { title: renameValue.trim() } });
      setSessions((prev) => prev.map((s) => s.id === renameTarget.id ? { ...s, title: renameValue.trim() } : s));
    } catch (e) { console.error("Rename failed", e); }
    setRenameTarget(null);
    setRenameValue("");
  };

  const confirmDeleteSession = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/sessions/${deleteTarget.id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    } catch (e) { console.error("Delete session failed", e); }
    setDeleteTarget(null);
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  };

  const getReadTime = (sessionId) => {
    try {
      const map = JSON.parse(localStorage.getItem("session-read-times") || "{}");
      return map[sessionId] || 0;
    } catch { return 0; }
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
        {sessions.length === 0 && (
          <div className="mt-16 text-center">
            <p className="text-sm" style={{ color: "var(--chat-text-muted)" }}>
              暂无会话，点击右上角 + 开始聊天
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {sessions.map((s) => {
            const preview = previews[s.id];
            const avatarUrl = avatarUrls[s.id];
            const readTime = getReadTime(s.id);
            const hasUnread = s.updated_at && new Date(s.updated_at).getTime() > readTime;
            return (
              <SwipeDeleteRow key={s.id} onDelete={() => setDeleteTarget(s)}>
                <div
                  className="flex w-full items-center gap-4 p-4 text-left"
                  onClick={() => navigate(`/chat/session/${s.id}`, { replace: true })}
                  onTouchStart={() => startLongPress(s)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onMouseDown={() => startLongPress(s)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full overflow-hidden text-[15px] font-medium"
                    style={{ background: "var(--chat-input-bg)", color: "var(--chat-accent-dark)" }}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{(s.title || "?")[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-medium truncate" style={{ color: "var(--chat-text)" }}>
                        {s.title || `会话 ${s.id}`}
                      </span>
                      <span className="text-[10px] shrink-0 ml-2" style={{ color: "var(--chat-text-muted)" }}>
                        {formatTime(s.updated_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs" style={{ color: "var(--chat-text-muted)" }}>
                      {preview ? preview.content : ""}
                    </p>
                  </div>
                  {hasUnread && (
                    <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--chat-accent-dark)" }} />
                  )}
                </div>
              </SwipeDeleteRow>
            );
          })}
        </div>
      </div>

      <Modal
        isOpen={selectMode !== null}
        onClose={() => setSelectMode(null)}
        title={selectMode === "chat" ? "选择助手" : "选择助手（多选）"}
        onConfirm={createSession}
        confirmText="确定"
        isConfirmDisabled={
          selectMode === "chat" ? selectedIds.length !== 1 : selectedIds.length < 2
        }
      >
        <div className="max-h-64 overflow-y-auto">
          {assistants.map((a) => {
            const selected = selectedIds.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => {
                  if (selectMode === "chat") setSelectedIds([a.id]);
                  else toggleSelect(a.id);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                style={{
                  background: selected ? "var(--chat-input-bg)" : "transparent",
                }}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium"
                  style={{ background: "var(--chat-bg)", color: "var(--chat-accent-dark)" }}
                >
                  {a.name[0]}
                </div>
                <span className="text-sm" style={{ color: "var(--chat-text)" }}>{a.name}</span>
                {selected && (
                  <span className="ml-auto text-xs" style={{ color: "var(--chat-accent-dark)" }}>已选</span>
                )}
              </button>
            );
          })}
          {assistants.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: "var(--chat-text-muted)" }}>
              暂无助手，请先在通讯录创建
            </p>
          )}
        </div>
      </Modal>

      {/* Rename session modal */}
      <Modal
        isOpen={renameTarget !== null}
        onClose={() => { setRenameTarget(null); setRenameValue(""); }}
        title="修改会话名称"
        onConfirm={confirmRename}
        confirmText="保存"
        isConfirmDisabled={!renameValue.trim()}
      >
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder="输入会话名称"
          className="w-full rounded-xl px-4 py-3 text-base outline-none"
          style={{ background: "var(--chat-input-bg)", border: "1px solid var(--chat-accent)" }}
          autoFocus
        />
      </Modal>

      {/* Delete session confirm */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSession}
        title="删除会话"
        message={deleteTarget ? `确定要删除「${deleteTarget.title || "会话"}」吗？所有聊天记录将被永久删除。` : ""}
        confirmText="删除"
      />
    </div>
  );
}
