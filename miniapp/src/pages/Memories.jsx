import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Trash2, ChevronDown, RotateCcw, X } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

const TABS = [
  { key: "memories", label: "记忆" },
  { key: "summaries", label: "摘要" },
  { key: "messages", label: "消息记录" },
];

const ACTION_WIDTH = 72;
const SNAP_THRESHOLD = 36;

/* ── Helpers ── */

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const time = `${h}:${m}`;
  if (diffMs < 86400000 && d.toDateString() === now.toDateString()) return time;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

/* ── Confirm dialog ── */

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.25)" }}
      onClick={onCancel}
    >
      <div
        className="mx-8 w-full max-w-[280px] rounded-[18px] p-5"
        style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-center text-[13px]" style={{ color: S.text }}>{message}</p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-[12px] py-2 text-[12px] font-medium"
            style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.textMuted }}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="flex-1 rounded-[12px] py-2 text-[12px] font-medium"
            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
            onClick={onConfirm}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Swipe row ── */

function SwipeRow({ children, onDelete }) {
  const rowRef = useRef(null);
  const actRef = useRef(null);
  const s = useRef({ sx: 0, sy: 0, base: 0, cur: 0, drag: false, locked: false, horiz: false });

  const snap = useCallback((x, anim) => {
    const el = rowRef.current;
    const act = actRef.current;
    if (!el) return;
    const t = anim ? "all .25s ease" : "none";
    el.style.transition = t;
    el.style.transform = `translateX(${x}px)`;
    if (act) {
      act.style.transition = t;
      act.style.opacity = `${Math.min(1, Math.abs(x) / ACTION_WIDTH)}`;
    }
    s.current.cur = x;
  }, []);

  const close = useCallback(() => snap(0, true), [snap]);

  return (
    <div className="relative overflow-hidden rounded-[14px]">
      <div ref={actRef} className="absolute right-0 top-0 bottom-0 flex items-center pr-2" style={{ opacity: 0 }}>
        <button
          onClick={() => { close(); onDelete(); }}
          className="flex h-[calc(100%-8px)] w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <Trash2 size={14} color="#ef4444" />
          <span className="text-[9px] font-medium" style={{ color: "#ef4444" }}>删除</span>
        </button>
      </div>
      <div
        ref={rowRef}
        className="relative z-10"
        style={{ transform: "translateX(0)", willChange: "transform" }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          const st = s.current;
          st.sx = t.clientX; st.sy = t.clientY;
          st.base = st.cur; st.drag = true; st.locked = false; st.horiz = false;
          if (rowRef.current) rowRef.current.style.transition = "none";
          if (actRef.current) actRef.current.style.transition = "none";
        }}
        onTouchMove={(e) => {
          const st = s.current;
          if (!st.drag) return;
          const t = e.touches[0];
          const dx = t.clientX - st.sx, dy = t.clientY - st.sy;
          if (!st.locked) {
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            st.locked = true;
            st.horiz = Math.abs(dx) > Math.abs(dy);
          }
          if (!st.horiz) { st.drag = false; return; }
          e.preventDefault();
          const nx = Math.max(-ACTION_WIDTH, Math.min(0, st.base + dx));
          if (rowRef.current) rowRef.current.style.transform = `translateX(${nx}px)`;
          if (actRef.current) actRef.current.style.opacity = `${Math.min(1, Math.abs(nx) / ACTION_WIDTH)}`;
          st.cur = nx;
        }}
        onTouchEnd={() => {
          s.current.drag = false;
          snap(s.current.cur < -SNAP_THRESHOLD ? -ACTION_WIDTH : 0, true);
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Expandable card ── */

function ExpandableCard({ children, time, badge, onSwipeDelete }) {
  const [expanded, setExpanded] = useState(false);

  const inner = (
    <div
      className="mb-2 rounded-[14px] p-3 cursor-pointer"
      style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
      onClick={() => setExpanded(!expanded)}
    >
      {badge}
      <div
        className="text-[12px] leading-relaxed break-words overflow-hidden transition-all"
        style={{ color: S.text, maxHeight: expanded ? "none" : 64 }}
      >
        {children}
      </div>
      {time && (
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px]" style={{ color: S.textMuted }}>{time}</span>
          {!expanded && (
            <ChevronDown size={12} style={{ color: S.textMuted }} />
          )}
        </div>
      )}
    </div>
  );

  if (onSwipeDelete) {
    return <SwipeRow onDelete={onSwipeDelete}>{inner}</SwipeRow>;
  }
  return inner;
}

/* ── Session selector popup ── */

function SessionSelector({ sessions, currentId, onSelect, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.2)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-t-[20px] pb-6"
        style={{ background: S.bg, boxShadow: "0 -4px 20px rgba(0,0,0,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[14px] font-bold" style={{ color: S.text }}>选择会话</span>
          <button onClick={onClose}>
            <X size={18} style={{ color: S.textMuted }} />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5">
          {sessions.map((sess) => (
            <button
              key={sess.id}
              className="mb-2 flex w-full items-center gap-3 rounded-[14px] p-3 text-left"
              style={{
                background: S.bg,
                boxShadow: sess.id === currentId ? "var(--inset-shadow)" : "var(--card-shadow-sm)",
              }}
              onClick={() => { onSelect(sess.id); onClose(); }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  background: sess.id === currentId ? "linear-gradient(135deg, #f0c4d8, var(--accent))" : S.bg,
                  boxShadow: sess.id === currentId ? "none" : "var(--icon-inset)",
                  color: sess.id === currentId ? "white" : S.textMuted,
                }}
              >
                {sess.id}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium truncate" style={{ color: S.text }}>
                  {sess.title || `会话 #${sess.id}`}
                </div>
                <div className="text-[10px]" style={{ color: S.textMuted }}>
                  {fmtTime(sess.updated_at || sess.created_at)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Trash item card ── */

function TrashCard({ content, deletedAt, onRestore, onPermanentDelete }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="mb-2 rounded-[14px] p-3"
      style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", opacity: 0.75 }}
    >
      <div
        className="text-[12px] leading-relaxed break-words overflow-hidden cursor-pointer"
        style={{ color: S.text, maxHeight: expanded ? "none" : 64 }}
        onClick={() => setExpanded(!expanded)}
      >
        {content}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px]" style={{ color: S.textMuted }}>
          {deletedAt ? `删除于 ${fmtTime(deletedAt)}` : ""}
        </span>
        <div className="flex gap-2">
          <button
            className="rounded-lg px-2 py-1 text-[10px] font-medium"
            style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}
            onClick={onRestore}
          >
            恢复
          </button>
          <button
            className="rounded-lg px-2 py-1 text-[10px] font-medium"
            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
            onClick={onPermanentDelete}
          >
            彻底删除
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */

export default function Memories() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("memories");
  const [trashMode, setTrashMode] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessPickerOpen, setSessPickerOpen] = useState(false);
  const [assistantName, setAssistantName] = useState(null);
  const [confirm, setConfirm] = useState(null); // { message, action }

  // Data
  const [memories, setMemories] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [messages, setMessages] = useState([]);
  const [trashMemories, setTrashMemories] = useState([]);
  const [trashSummaries, setTrashSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMoreMsg, setHasMoreMsg] = useState(false);

  // Load sessions list
  useEffect(() => {
    apiFetch("/api/sessions?limit=50").then((d) => {
      const list = d.sessions || [];
      setSessions(list);
      if (list.length > 0 && !sessionId) setSessionId(list[0].id);
    }).catch(() => {});
  }, []);

  // Load assistant name when session changes
  useEffect(() => {
    if (!sessionId) return;
    apiFetch(`/api/sessions/${sessionId}/info`).then((d) => {
      setAssistantName(d.assistant_name || null);
    }).catch(() => setAssistantName(null));
  }, [sessionId]);

  // Load data when session or trashMode changes
  useEffect(() => {
    if (!sessionId) return;
    loadData();
  }, [sessionId, trashMode]);

  const loadData = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      if (trashMode) {
        const [memTrash, sumTrash] = await Promise.all([
          apiFetch("/api/memories/trash?limit=100"),
          apiFetch(`/api/sessions/${sessionId}/summaries/trash`),
        ]);
        setTrashMemories(memTrash.memories || []);
        setTrashSummaries(sumTrash.summaries || []);
      } else {
        if (tab === "memories" || tab === "summaries") {
          const [memData, sumData] = await Promise.all([
            apiFetch("/api/memories?limit=100"),
            apiFetch(`/api/sessions/${sessionId}/summaries`),
          ]);
          setMemories(memData.memories || []);
          setSummaries(sumData.summaries || []);
        }
        if (tab === "messages") {
          const msgData = await apiFetch(`/api/sessions/${sessionId}/messages?limit=50`);
          setMessages((msgData.messages || []).reverse());
          setHasMoreMsg(msgData.has_more || false);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Reload when tab switches (for non-trash mode)
  useEffect(() => {
    if (!sessionId || trashMode) return;
    loadData();
  }, [tab]);

  const loadMoreMsg = async () => {
    if (!sessionId || !hasMoreMsg || loading) return;
    const oldest = messages[messages.length - 1];
    if (!oldest) return;
    setLoading(true);
    try {
      const msgData = await apiFetch(`/api/sessions/${sessionId}/messages?limit=50&before_id=${oldest.id}`);
      const older = (msgData.messages || []).reverse();
      setMessages((prev) => [...prev, ...older]);
      setHasMoreMsg(msgData.has_more || false);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Delete handlers (all with confirmation)
  const confirmAction = (message, action) => setConfirm({ message, action });

  const deleteMemory = (id) => {
    confirmAction("确定要删除这条记忆吗？", async () => {
      await apiFetch(`/api/memories/${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    });
  };

  const deleteSummary = (id) => {
    confirmAction("确定要删除这条摘要吗？", async () => {
      await apiFetch(`/api/sessions/${sessionId}/summaries/${id}`, { method: "DELETE" });
      setSummaries((prev) => prev.filter((s) => s.id !== id));
    });
  };

  const deleteMessage = (id) => {
    confirmAction("确定要删除这条消息吗？", async () => {
      await apiFetch(`/api/sessions/${sessionId}/messages/${id}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
  };

  const restoreMemory = async (id) => {
    await apiFetch(`/api/memories/${id}/restore`, { method: "POST" });
    setTrashMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const permanentDeleteMemory = (id) => {
    confirmAction("彻底删除后不可恢复，确定吗？", async () => {
      await apiFetch(`/api/memories/${id}/permanent`, { method: "DELETE" });
      setTrashMemories((prev) => prev.filter((m) => m.id !== id));
    });
  };

  const restoreSummary = async (id) => {
    await apiFetch(`/api/sessions/${sessionId}/summaries/${id}/restore`, { method: "POST" });
    setTrashSummaries((prev) => prev.filter((s) => s.id !== id));
  };

  const permanentDeleteSummary = (id) => {
    confirmAction("彻底删除后不可恢复，确定吗？", async () => {
      await apiFetch(`/api/sessions/${sessionId}/summaries/${id}/permanent`, { method: "DELETE" });
      setTrashSummaries((prev) => prev.filter((s) => s.id !== id));
    });
  };

  const roleLabel = (role) => {
    if (role === "user") return "我";
    if (role === "assistant") return assistantName || "助手";
    return "系统";
  };

  const roleColor = (role) => {
    if (role === "user") return S.accentDark;
    if (role === "assistant") return "#3a9b5c";
    return S.textMuted;
  };

  /* ── Render content ── */

  const renderMemories = () => {
    if (loading && memories.length === 0) return <Spinner />;
    if (memories.length === 0) return <Empty text="暂无记忆" />;
    return memories.map((mem) => (
      <ExpandableCard
        key={mem.id}
        time={fmtTime(mem.created_at)}
        onSwipeDelete={() => deleteMemory(mem.id)}
        badge={
          <span
            className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "rgba(232,160,191,0.15)", color: S.accentDark }}
          >
            {mem.klass}
          </span>
        }
      >
        {mem.content}
      </ExpandableCard>
    ));
  };

  const renderSummaries = () => {
    if (loading && summaries.length === 0) return <Spinner />;
    if (summaries.length === 0) return <Empty text="暂无摘要" />;
    return summaries.map((s) => (
      <ExpandableCard
        key={s.id}
        time={fmtTime(s.created_at)}
        onSwipeDelete={() => deleteSummary(s.id)}
        badge={
          s.mood_tag ? (
            <span
              className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(232,160,191,0.15)", color: S.accentDark }}
            >
              {s.mood_tag}
            </span>
          ) : null
        }
      >
        {s.summary_content || "(空)"}
      </ExpandableCard>
    ));
  };

  const renderMessages = () => {
    if (loading && messages.length === 0) return <Spinner />;
    if (messages.length === 0) return <Empty text="暂无消息" />;
    return (
      <>
        <p className="mb-2 text-[11px]" style={{ color: S.textMuted }}>左滑消息可删除</p>
        {messages.map((msg) => (
          <SwipeRow key={msg.id} onDelete={() => deleteMessage(msg.id)}>
            <div
              className="mb-2 rounded-[14px] p-3"
              style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold" style={{ color: roleColor(msg.role) }}>
                  {roleLabel(msg.role)}
                </span>
                <span className="text-[10px]" style={{ color: S.textMuted }}>{fmtTime(msg.created_at)}</span>
              </div>
              <p
                className="text-[12px] leading-relaxed break-words"
                style={{ color: S.text, maxHeight: 120, overflow: "hidden" }}
              >
                {msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content}
              </p>
            </div>
          </SwipeRow>
        ))}
        {hasMoreMsg && (
          <button
            className="mx-auto mt-2 block rounded-[10px] px-4 py-2 text-[12px]"
            style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.accentDark }}
            onClick={loadMoreMsg}
            disabled={loading}
          >
            {loading ? "加载中..." : "加载更多"}
          </button>
        )}
      </>
    );
  };

  const renderTrash = () => {
    if (loading) return <Spinner />;
    const items = tab === "memories" ? trashMemories : trashSummaries;
    if (items.length === 0) return <Empty text="回收站为空" />;
    return items.map((item) => (
      <TrashCard
        key={item.id}
        content={item.content || item.summary_content || "(空)"}
        deletedAt={item.deleted_at}
        onRestore={() => (tab === "memories" ? restoreMemory(item.id) : restoreSummary(item.id))}
        onPermanentDelete={() => (tab === "memories" ? permanentDeleteMemory(item.id) : permanentDeleteSummary(item.id))}
      />
    ));
  };

  const content = trashMode
    ? renderTrash()
    : tab === "memories"
      ? renderMemories()
      : tab === "summaries"
        ? renderSummaries()
        : renderMessages();

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-5 pb-3"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
          onClick={() => navigate("/", { replace: true })}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>
          {trashMode ? "回收站" : "记忆管理"}
        </h1>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: S.bg,
            boxShadow: trashMode ? "var(--inset-shadow)" : "var(--card-shadow-sm)",
          }}
          onClick={() => setTrashMode(!trashMode)}
        >
          <Trash2 size={16} style={{ color: trashMode ? "#ef4444" : S.accentDark }} />
        </button>
      </div>

      {/* Tab row with session selector */}
      <div className="shrink-0 px-5 pb-3">
        <div className="flex items-center gap-2">
          {/* Session selector button */}
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.accentDark }}
            onClick={() => setSessPickerOpen(true)}
          >
            {sessionId ?? "?"}
          </button>

          {/* Tabs */}
          <div
            className="flex flex-1 rounded-[14px] p-1"
            style={{ background: S.bg, boxShadow: "var(--inset-shadow)" }}
          >
            {TABS.map((t) => {
              const disabled = trashMode && t.key === "messages";
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  className="flex-1 rounded-[12px] py-2 text-[12px] font-medium transition-all"
                  style={
                    disabled
                      ? { color: S.textMuted, opacity: 0.35, cursor: "default" }
                      : active
                        ? { background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.accentDark }
                        : { color: S.textMuted }
                  }
                  disabled={disabled}
                  onClick={() => !disabled && setTab(t.key)}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {content}
      </div>

      {/* Session picker */}
      {sessPickerOpen && (
        <SessionSelector
          sessions={sessions}
          currentId={sessionId}
          onSelect={setSessionId}
          onClose={() => setSessPickerOpen(false)}
        />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={async () => {
            try { await confirm.action(); } catch (e) { console.error(e); }
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: S.accent, borderTopColor: "transparent" }} />
    </div>
  );
}

function Empty({ text }) {
  return <p className="py-16 text-center text-[14px]" style={{ color: S.textMuted }}>{text}</p>;
}
