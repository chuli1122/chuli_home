import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Trash2, ChevronDown, Pencil, Search, X, Check } from "lucide-react";
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
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const time = `${h}:${m}`;
  if (now - d < 86400000 && d.toDateString() === now.toDateString()) return time;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function Highlight({ text, keyword }) {
  if (!keyword || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  const parts = [];
  let last = 0;
  let idx = lower.indexOf(kw, last);
  while (idx !== -1) {
    if (idx > last) parts.push(<span key={last}>{text.slice(last, idx)}</span>);
    parts.push(
      <span key={`h${idx}`} style={{ color: S.accentDark, fontWeight: 600 }}>
        {text.slice(idx, idx + kw.length)}
      </span>
    );
    last = idx + kw.length;
    idx = lower.indexOf(kw, last);
  }
  if (last < text.length) parts.push(<span key={last}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

/* ── Confirm dialog ── */

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }} onClick={onCancel}>
      <div className="mx-8 w-full max-w-[280px] rounded-[18px] p-5" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4 text-center text-[13px]" style={{ color: S.text }}>{message}</p>
        <div className="flex gap-3">
          <button className="flex-1 rounded-[12px] py-2 text-[12px] font-medium" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.textMuted }} onClick={onCancel}>取消</button>
          <button className="flex-1 rounded-[12px] py-2 text-[12px] font-medium" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }} onClick={onConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit modal ── */

function EditModal({ initialText, onSave, onCancel }) {
  const [text, setText] = useState(initialText);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }} onClick={onCancel}>
      <div className="mx-5 w-full max-w-[340px] rounded-[18px] p-4" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }} onClick={(e) => e.stopPropagation()}>
        <textarea
          className="w-full rounded-[12px] p-3 text-[12px] leading-relaxed resize-none outline-none"
          style={{ background: S.bg, boxShadow: "var(--inset-shadow)", color: S.text, minHeight: 140, maxHeight: 280 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="mt-3 flex gap-3">
          <button className="flex-1 rounded-[12px] py-2 text-[12px] font-medium" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.textMuted }} onClick={onCancel}>取消</button>
          <button
            className="flex-1 rounded-[12px] py-2 text-[12px] font-medium"
            style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.accentDark }}
            onClick={() => onSave(text)}
            disabled={!text.trim()}
          >
            保存
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
    if (act) { act.style.transition = t; act.style.opacity = `${Math.min(1, Math.abs(x) / ACTION_WIDTH)}`; }
    s.current.cur = x;
  }, []);
  const close = useCallback(() => snap(0, true), [snap]);

  return (
    <div className="relative overflow-hidden rounded-[14px]">
      <div ref={actRef} className="absolute right-0 top-0 bottom-0 flex items-center pr-2" style={{ opacity: 0 }}>
        <button onClick={() => { close(); onDelete(); }} className="flex h-[calc(100%-8px)] w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <Trash2 size={14} color="#ef4444" />
          <span className="text-[9px] font-medium" style={{ color: "#ef4444" }}>删除</span>
        </button>
      </div>
      <div ref={rowRef} className="relative z-10" style={{ transform: "translateX(0)", willChange: "transform" }}
        onTouchStart={(e) => { const t = e.touches[0]; const st = s.current; st.sx = t.clientX; st.sy = t.clientY; st.base = st.cur; st.drag = true; st.locked = false; st.horiz = false; if (rowRef.current) rowRef.current.style.transition = "none"; if (actRef.current) actRef.current.style.transition = "none"; }}
        onTouchMove={(e) => { const st = s.current; if (!st.drag) return; const t = e.touches[0]; const dx = t.clientX - st.sx, dy = t.clientY - st.sy; if (!st.locked) { if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; st.locked = true; st.horiz = Math.abs(dx) > Math.abs(dy); } if (!st.horiz) { st.drag = false; return; } e.preventDefault(); const nx = Math.max(-ACTION_WIDTH, Math.min(0, st.base + dx)); if (rowRef.current) rowRef.current.style.transform = `translateX(${nx}px)`; if (actRef.current) actRef.current.style.opacity = `${Math.min(1, Math.abs(nx) / ACTION_WIDTH)}`; st.cur = nx; }}
        onTouchEnd={() => { s.current.drag = false; snap(s.current.cur < -SNAP_THRESHOLD ? -ACTION_WIDTH : 0, true); }}
      >{children}</div>
    </div>
  );
}

/* ── Expandable card (memory / summary) ── */

function ExpandableCard({ children, time, badge, keyword, onSwipeDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const inner = (
    <div className="mb-2 rounded-[14px] p-3" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          {badge}
          <div
            className="text-[12px] leading-relaxed break-words overflow-hidden cursor-pointer transition-all"
            style={{ color: S.text, maxHeight: expanded ? "none" : 64 }}
            onClick={() => setExpanded(!expanded)}
          >
            <Highlight text={typeof children === "string" ? children : ""} keyword={keyword} />
          </div>
        </div>
        {onEdit && (
          <button
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil size={11} style={{ color: S.accentDark }} />
          </button>
        )}
      </div>
      {time && (
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px]" style={{ color: S.textMuted }}>{time}</span>
          {!expanded && <ChevronDown size={12} style={{ color: S.textMuted }} />}
        </div>
      )}
    </div>
  );
  if (onSwipeDelete) return <SwipeRow onDelete={onSwipeDelete}>{inner}</SwipeRow>;
  return inner;
}

/* ── Trash card ── */

function TrashCard({ content, deletedAt, keyword, onRestore, onPermanentDelete }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-2 rounded-[14px] p-3" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", opacity: 0.75 }}>
      <div className="text-[12px] leading-relaxed break-words overflow-hidden cursor-pointer" style={{ color: S.text, maxHeight: expanded ? "none" : 64 }} onClick={() => setExpanded(!expanded)}>
        <Highlight text={content} keyword={keyword} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px]" style={{ color: S.textMuted }}>{deletedAt ? `删除于 ${fmtTime(deletedAt)}` : ""}</span>
        <div className="flex gap-2">
          <button className="rounded-lg px-2 py-1 text-[10px] font-medium" style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6" }} onClick={onRestore}>恢复</button>
          <button className="rounded-lg px-2 py-1 text-[10px] font-medium" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }} onClick={onPermanentDelete}>彻底删除</button>
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
  const [assistantName, setAssistantName] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(null); // { type, id, text }

  const [memories, setMemories] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [messages, setMessages] = useState([]);
  const [trashMemories, setTrashMemories] = useState([]);
  const [trashSummaries, setTrashSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMoreMsg, setHasMoreMsg] = useState(false);

  // Load sessions
  useEffect(() => {
    apiFetch("/api/sessions?limit=50").then((d) => {
      const list = d.sessions || [];
      setSessions(list);
      if (list.length > 0 && !sessionId) setSessionId(list[0].id);
    }).catch(() => {});
  }, []);

  // Load assistant name
  useEffect(() => {
    if (!sessionId) return;
    apiFetch(`/api/sessions/${sessionId}/info`).then((d) => setAssistantName(d.assistant_name || null)).catch(() => setAssistantName(null));
  }, [sessionId]);

  // Load data
  useEffect(() => { if (sessionId) loadData(); }, [sessionId, trashMode]);
  useEffect(() => { if (sessionId && !trashMode) loadData(); }, [tab]);

  const loadData = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      if (trashMode) {
        const [memT, sumT] = await Promise.all([
          apiFetch("/api/memories/trash?limit=100"),
          apiFetch(`/api/sessions/${sessionId}/summaries/trash`),
        ]);
        setTrashMemories(memT.memories || []);
        setTrashSummaries(sumT.summaries || []);
      } else if (tab === "memories") {
        const d = await apiFetch("/api/memories?limit=100");
        setMemories(d.memories || []);
      } else if (tab === "summaries") {
        const d = await apiFetch(`/api/sessions/${sessionId}/summaries`);
        setSummaries(d.summaries || []);
      } else {
        const d = await apiFetch(`/api/sessions/${sessionId}/messages?limit=50`);
        setMessages((d.messages || []).reverse());
        setHasMoreMsg(d.has_more || false);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadMoreMsg = async () => {
    if (!sessionId || !hasMoreMsg || loading) return;
    const oldest = messages[messages.length - 1];
    if (!oldest) return;
    setLoading(true);
    try {
      const d = await apiFetch(`/api/sessions/${sessionId}/messages?limit=50&before_id=${oldest.id}`);
      setMessages((prev) => [...prev, ...(d.messages || []).reverse()]);
      setHasMoreMsg(d.has_more || false);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Filter by search keyword
  const kw = searchText.trim().toLowerCase();
  const filteredMemories = useMemo(() => kw ? memories.filter((m) => m.content.toLowerCase().includes(kw)) : memories, [memories, kw]);
  const filteredSummaries = useMemo(() => kw ? summaries.filter((s) => (s.summary_content || "").toLowerCase().includes(kw)) : summaries, [summaries, kw]);
  const filteredMessages = useMemo(() => kw ? messages.filter((m) => m.content.toLowerCase().includes(kw)) : messages, [messages, kw]);
  const filteredTrashMem = useMemo(() => kw ? trashMemories.filter((m) => m.content.toLowerCase().includes(kw)) : trashMemories, [trashMemories, kw]);
  const filteredTrashSum = useMemo(() => kw ? trashSummaries.filter((s) => (s.summary_content || "").toLowerCase().includes(kw)) : trashSummaries, [trashSummaries, kw]);

  // Actions
  const confirmAction = (message, action) => setConfirm({ message, action });

  const deleteMemory = (id) => confirmAction("确定要删除这条记忆吗？", async () => { await apiFetch(`/api/memories/${id}`, { method: "DELETE" }); setMemories((p) => p.filter((m) => m.id !== id)); });
  const deleteSummary = (id) => confirmAction("确定要删除这条摘要吗？", async () => { await apiFetch(`/api/sessions/${sessionId}/summaries/${id}`, { method: "DELETE" }); setSummaries((p) => p.filter((s) => s.id !== id)); });
  const deleteMessage = (id) => confirmAction("确定要删除这条消息吗？", async () => { await apiFetch(`/api/sessions/${sessionId}/messages/${id}`, { method: "DELETE" }); setMessages((p) => p.filter((m) => m.id !== id)); });

  const restoreMemory = async (id) => { await apiFetch(`/api/memories/${id}/restore`, { method: "POST" }); setTrashMemories((p) => p.filter((m) => m.id !== id)); };
  const permanentDeleteMemory = (id) => confirmAction("彻底删除后不可恢复，确定吗？", async () => { await apiFetch(`/api/memories/${id}/permanent`, { method: "DELETE" }); setTrashMemories((p) => p.filter((m) => m.id !== id)); });
  const restoreSummary = async (id) => { await apiFetch(`/api/sessions/${sessionId}/summaries/${id}/restore`, { method: "POST" }); setTrashSummaries((p) => p.filter((s) => s.id !== id)); };
  const permanentDeleteSummary = (id) => confirmAction("彻底删除后不可恢复，确定吗？", async () => { await apiFetch(`/api/sessions/${sessionId}/summaries/${id}/permanent`, { method: "DELETE" }); setTrashSummaries((p) => p.filter((s) => s.id !== id)); });

  const saveEdit = async (text) => {
    if (!editing) return;
    try {
      if (editing.type === "memory") {
        await apiFetch(`/api/memories/${editing.id}`, { method: "PUT", body: JSON.stringify({ content: text }) });
        setMemories((p) => p.map((m) => m.id === editing.id ? { ...m, content: text } : m));
      } else {
        await apiFetch(`/api/sessions/${sessionId}/summaries/${editing.id}`, { method: "PATCH", body: JSON.stringify({ summary_content: text }) });
        setSummaries((p) => p.map((s) => s.id === editing.id ? { ...s, summary_content: text } : s));
      }
    } catch (e) { console.error(e); }
    setEditing(null);
  };

  const roleLabel = (role) => { if (role === "user") return "我"; if (role === "assistant") return assistantName || "助手"; return "系统"; };
  const roleColor = (role) => { if (role === "user") return S.accentDark; if (role === "assistant") return "#8b5cf6"; return S.textMuted; };

  /* ── Render ── */

  const renderMemories = () => {
    if (loading && memories.length === 0) return <Spinner />;
    if (filteredMemories.length === 0) return <Empty text={kw ? "无匹配记忆" : "暂无记忆"} />;
    return filteredMemories.map((mem) => (
      <ExpandableCard key={mem.id} time={fmtTime(mem.created_at)} keyword={kw}
        onSwipeDelete={() => deleteMemory(mem.id)}
        onEdit={() => setEditing({ type: "memory", id: mem.id, text: mem.content })}
        badge={<span className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(232,160,191,0.15)", color: S.accentDark }}>{mem.klass}</span>}
      >{mem.content}</ExpandableCard>
    ));
  };

  const renderSummaries = () => {
    if (loading && summaries.length === 0) return <Spinner />;
    if (filteredSummaries.length === 0) return <Empty text={kw ? "无匹配摘要" : "暂无摘要"} />;
    return filteredSummaries.map((s) => (
      <ExpandableCard key={s.id} time={fmtTime(s.created_at)} keyword={kw}
        onSwipeDelete={() => deleteSummary(s.id)}
        onEdit={() => setEditing({ type: "summary", id: s.id, text: s.summary_content })}
        badge={s.mood_tag ? <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(232,160,191,0.15)", color: S.accentDark }}>{s.mood_tag}</span> : null}
      >{s.summary_content || "(空)"}</ExpandableCard>
    ));
  };

  const renderMessages = () => {
    if (loading && messages.length === 0) return <Spinner />;
    if (filteredMessages.length === 0) return <Empty text={kw ? "无匹配消息" : "暂无消息"} />;
    return (
      <>
        <p className="mb-2 text-[11px]" style={{ color: S.textMuted }}>左滑消息可删除</p>
        {filteredMessages.map((msg) => (
          <SwipeRow key={msg.id} onDelete={() => deleteMessage(msg.id)}>
            <div className="mb-2 rounded-[14px] p-3" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold" style={{ color: roleColor(msg.role) }}>{roleLabel(msg.role)}</span>
                <span className="text-[10px]" style={{ color: S.textMuted }}>{fmtTime(msg.created_at)}</span>
              </div>
              <p className="text-[12px] leading-relaxed break-words" style={{ color: S.text, maxHeight: 120, overflow: "hidden" }}>
                <Highlight text={msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content} keyword={kw} />
              </p>
            </div>
          </SwipeRow>
        ))}
        {hasMoreMsg && !kw && (
          <button className="mx-auto mt-2 block rounded-[10px] px-4 py-2 text-[12px]" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.accentDark }} onClick={loadMoreMsg} disabled={loading}>
            {loading ? "加载中..." : "加载更多"}
          </button>
        )}
      </>
    );
  };

  const renderTrash = () => {
    if (loading) return <Spinner />;
    const items = tab === "memories" ? filteredTrashMem : filteredTrashSum;
    if (items.length === 0) return <Empty text={kw ? "无匹配项" : "回收站为空"} />;
    return items.map((item) => (
      <TrashCard key={item.id} content={item.content || item.summary_content || "(空)"} deletedAt={item.deleted_at} keyword={kw}
        onRestore={() => (tab === "memories" ? restoreMemory(item.id) : restoreSummary(item.id))}
        onPermanentDelete={() => (tab === "memories" ? permanentDeleteMemory(item.id) : permanentDeleteSummary(item.id))}
      />
    ));
  };

  const content = trashMode ? renderTrash() : tab === "memories" ? renderMemories() : tab === "summaries" ? renderSummaries() : renderMessages();

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-3" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        <button className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }} onClick={() => navigate("/", { replace: true })}>
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>{trashMode ? "回收站" : "记忆管理"}</h1>
        <button className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: S.bg, boxShadow: trashMode ? "var(--inset-shadow)" : "var(--card-shadow-sm)" }} onClick={() => setTrashMode(!trashMode)}>
          <Trash2 size={16} style={{ color: trashMode ? "#ef4444" : S.accentDark }} />
        </button>
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-5 pb-2">
        <div className="flex rounded-[14px] p-1" style={{ background: S.bg, boxShadow: "var(--inset-shadow)" }}>
          {TABS.map((t) => {
            const disabled = trashMode && t.key === "messages";
            const active = tab === t.key;
            return (
              <button key={t.key} className="flex-1 rounded-[12px] py-2 text-[12px] font-medium transition-all"
                style={disabled ? { color: S.textMuted, opacity: 0.35, cursor: "default" } : active ? { background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.accentDark } : { color: S.textMuted }}
                disabled={disabled} onClick={() => !disabled && setTab(t.key)}
              >{t.label}</button>
            );
          })}
        </div>
      </div>

      {/* Session dropdown + Search */}
      <div className="shrink-0 px-5 pb-3">
        <div className="flex items-center gap-2">
          {/* Session dropdown */}
          <div className="relative" style={{ width: "33%" }}>
            <select
              className="w-full appearance-none rounded-[12px] py-2 pl-3 pr-7 text-[11px] font-medium outline-none truncate"
              style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.text, WebkitAppearance: "none" }}
              value={sessionId ?? ""}
              onChange={(e) => setSessionId(Number(e.target.value))}
            >
              {sessions.map((sess) => (
                <option key={sess.id} value={sess.id}>
                  #{sess.id} {sess.title || ""}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" style={{ color: S.textMuted }} />
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: S.textMuted }} />
            <input
              className="w-full rounded-[12px] py-2 pl-8 pr-7 text-[11px] outline-none"
              style={{ background: S.bg, boxShadow: "var(--inset-shadow)", color: S.text }}
              placeholder="搜索关键词..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchText("")}>
                <X size={13} style={{ color: S.textMuted }} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">{content}</div>

      {/* Modals */}
      {confirm && (
        <ConfirmDialog message={confirm.message}
          onConfirm={async () => { try { await confirm.action(); } catch (e) { console.error(e); } setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {editing && <EditModal initialText={editing.text} onSave={saveEdit} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: S.accent, borderTopColor: "transparent" }} /></div>;
}
function Empty({ text }) {
  return <p className="py-16 text-center text-[14px]" style={{ color: S.textMuted }}>{text}</p>;
}
