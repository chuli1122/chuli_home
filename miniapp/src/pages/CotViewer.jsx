import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ChevronLeft, Wrench, RefreshCw, Cpu, Trash2 } from "lucide-react";
import { apiFetch } from "../utils/api";
import { getAvatar } from "../utils/db";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

const BLOCK_COLORS = {
  thinking: { bg: "rgba(168,130,200,0.12)", color: "#8860c8", label: "思考" },
  tool_use: { bg: "rgba(232,160,60,0.12)", color: "#b8820a", label: "工具调用" },
  tool_result: { bg: "rgba(80,160,200,0.12)", color: "#1a7ab0", label: "工具结果" },
};

const MODES = [
  { key: "short", label: "短消息" },
  { key: "long", label: "长消息" },
  { key: "theater", label: "小剧场" },
];

const MOODS = [
  { key: "happy", label: "开心" },
  { key: "sad", label: "难过" },
  { key: "angry", label: "生气" },
  { key: "anxious", label: "焦虑" },
  { key: "tired", label: "疲意" },
  { key: "emo", label: "低落" },
  { key: "flirty", label: "心动" },
  { key: "proud", label: "得意" },
  { key: "calm", label: "平静" },
];

const COLLAPSE_THRESHOLD = 300;
const ACTION_WIDTH = 80;
const SNAP_THRESHOLD = 40;

/* ── Confirm dialog ── */

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }} onClick={onCancel}>
      <div className="mx-6 w-full max-w-[300px] rounded-[22px] p-6" style={{ background: S.bg, boxShadow: "0 8px 30px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-center text-[16px] font-bold" style={{ color: S.text }}>确认删除</p>
        <p className="mb-5 text-center text-[13px]" style={{ color: S.textMuted }}>{message}</p>
        <div className="flex gap-3">
          <button className="flex-1 rounded-[16px] py-3 text-[15px] font-semibold" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.text }} onClick={onCancel}>取消</button>
          <button className="flex-1 rounded-[16px] py-3 text-[15px] font-semibold text-white" style={{ background: "#ff4d6d", boxShadow: "4px 4px 10px rgba(255,77,109,0.4)" }} onClick={onConfirm}>删除</button>
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
    el.style.transform = x ? `translateX(${x}px)` : "";
    if (act) { act.style.transition = t; act.style.opacity = `${Math.min(1, Math.abs(x) / ACTION_WIDTH)}`; }
    if (!x) el.style.willChange = "auto";
    s.current.cur = x;
  }, []);
  const close = useCallback(() => snap(0, true), [snap]);

  return (
    <div className="relative mb-3 overflow-hidden rounded-[18px]" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}>
      <div ref={actRef} className="absolute right-0 top-0 bottom-0 flex items-center pr-2" style={{ opacity: 0 }}>
        <button onClick={() => { close(); onDelete(); }} className="flex h-[calc(100%-12px)] w-[68px] flex-col items-center justify-center gap-1 rounded-[14px]" style={{ background: "#ff4d6d" }}>
          <Trash2 size={16} color="white" />
          <span className="text-[11px] font-medium text-white">删除</span>
        </button>
      </div>
      <div ref={rowRef} className="relative z-10"
        onTouchStart={(e) => { const t = e.touches[0]; const st = s.current; st.sx = t.clientX; st.sy = t.clientY; st.base = st.cur; st.drag = true; st.locked = false; st.horiz = false; if (rowRef.current) rowRef.current.style.transition = "none"; if (actRef.current) actRef.current.style.transition = "none"; }}
        onTouchMove={(e) => { const st = s.current; if (!st.drag) return; const t = e.touches[0]; const dx = t.clientX - st.sx, dy = t.clientY - st.sy; if (!st.locked) { if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return; st.locked = true; st.horiz = Math.abs(dx) > Math.abs(dy); if (st.horiz && rowRef.current) rowRef.current.style.willChange = "transform"; } if (!st.horiz) { st.drag = false; return; } e.preventDefault(); const nx = Math.max(-ACTION_WIDTH, Math.min(0, st.base + dx)); if (rowRef.current) rowRef.current.style.transform = `translateX(${nx}px)`; if (actRef.current) actRef.current.style.opacity = `${Math.min(1, Math.abs(nx) / ACTION_WIDTH)}`; st.cur = nx; }}
        onTouchEnd={() => { s.current.drag = false; snap(s.current.cur < -SNAP_THRESHOLD ? -ACTION_WIDTH : 0, true); }}
      >{children}</div>
    </div>
  );
}

/* ── Block chip ── */

function BlockChip({ block_type }) {
  const meta = BLOCK_COLORS[block_type] || { bg: "rgba(136,136,160,0.1)", color: S.textMuted, label: block_type };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

/* ── Expandable block content ── */

function BlockContent({ content }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > COLLAPSE_THRESHOLD;

  return (
    <>
      <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed" style={{ color: S.text }}>
        {isLong && !expanded ? content.slice(0, COLLAPSE_THRESHOLD) + "..." : content}
      </p>
      {isLong && (
        <div className="mt-1.5 flex justify-center">
          <button
            className="rounded-full px-3 py-0.5 text-[11px]"
            style={{ color: S.accentDark, background: "rgba(232,160,191,0.12)" }}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? "收起" : "查看更多"}
          </button>
        </div>
      )}
    </>
  );
}

/* ── Avatar helper ── */

function AvatarIcon({ avatarUrl }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden"
      style={{ boxShadow: "var(--icon-inset)", background: S.bg }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontSize: 16 }}>🐰</span>
      )}
    </div>
  );
}

/* ── COT Card ── */

function fmtTokens(n) {
  if (!n) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function TokenBadges({ prompt, completion }) {
  if (!prompt && !completion) return null;
  return (
    <>
      <span
        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
        style={{ background: "rgba(80,160,120,0.12)", color: "#3a8a5f" }}
      >
        ↑{fmtTokens(prompt)}
      </span>
      <span
        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
        style={{ background: "rgba(160,100,220,0.12)", color: "#8a5abf" }}
      >
        ↓{fmtTokens(completion)}
      </span>
    </>
  );
}

function CotCard({ item, expanded, onToggle, live, avatarUrl }) {
  // Filter out "text" and "usage" blocks — only show thinking, tool_use, tool_result
  const filteredRounds = item.rounds.map((round) => ({
    ...round,
    blocks: round.blocks.filter((b) => b.block_type !== "text" && b.block_type !== "usage"),
  })).filter((round) => round.blocks.length > 0);

  return (
    <div className="rounded-[18px] overflow-hidden" style={{ background: S.bg }}>
      <button className="flex w-full items-center gap-3 p-4" onClick={onToggle}>
        <AvatarIcon avatarUrl={avatarUrl} />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            {live && (
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px]"
                style={{ borderColor: S.accentDark, borderTopColor: "transparent" }}
              />
            )}
            {item.has_tool_calls && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                style={{ background: "rgba(232,160,60,0.15)", color: "#b8820a" }}
              >
                工具
              </span>
            )}
            <TokenBadges prompt={item.prompt_tokens || 0} completion={item.completion_tokens || 0} />
            <span className="text-[10px]" style={{ color: S.textMuted }}>
              {item.created_at || ""}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[13px]" style={{ color: S.text }}>
            {item.preview || "(无预览)"}
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={16} style={{ color: S.textMuted, flexShrink: 0 }} />
        ) : (
          <ChevronDown size={16} style={{ color: S.textMuted, flexShrink: 0 }} />
        )}
      </button>

      {expanded && filteredRounds.length > 0 && (
        <div className="px-4 pb-4">
          {filteredRounds.map((round) => (
            <div key={round.round_index} className="mb-3">
              {filteredRounds.length > 1 && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-px flex-1" style={{ background: "rgba(136,136,160,0.15)" }} />
                  <span className="text-[10px] font-semibold" style={{ color: S.textMuted }}>
                    轮 {round.round_index + 1}
                  </span>
                  <div className="h-px flex-1" style={{ background: "rgba(136,136,160,0.15)" }} />
                </div>
              )}
              {round.blocks.map((block, i) => {
                const meta = BLOCK_COLORS[block.block_type] || { bg: "rgba(136,136,160,0.08)", color: S.textMuted, label: block.block_type };
                return (
                  <div key={i} className="mb-2 rounded-[12px] p-3" style={{ background: meta.bg }}>
                    <div className="mb-1 flex items-center gap-2">
                      <BlockChip block_type={block.block_type} />
                      {block.tool_name && (
                        <span className="text-[10px] font-mono" style={{ color: meta.color }}>
                          {block.tool_name}
                        </span>
                      )}
                    </div>
                    <BlockContent content={block.content} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main page ── */

export default function CotViewer() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [mode, setMode] = useState(() =>
    localStorage.getItem("chat_mode") || "long"
  );
  const [wsConnected, setWsConnected] = useState(false);
  const [liveRequestIds, setLiveRequestIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const wsRef = useRef(null);
  const [mood, setMood] = useState(null);
  const [moodOpen, setMoodOpen] = useState(false);
  const moodRef = useRef(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiFetch("/api/cot?limit=30")
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error("COT load error:", err);
        setError(err.message || "加载失败");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Load assistant avatar
  useEffect(() => {
    apiFetch("/api/sessions?limit=1").then((d) => {
      const sess = d.sessions?.[0];
      if (sess?.assistant_id) {
        getAvatar(`assistant-avatar-${sess.assistant_id}`).then((b64) => {
          if (b64) setAvatarUrl(b64);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // Load current mood
  useEffect(() => {
    apiFetch("/api/settings/mood")
      .then((data) => setMood(data.mood || "calm"))
      .catch(() => setMood("calm"));
  }, []);

  // Close mood popup on outside click
  useEffect(() => {
    if (!moodOpen) return;
    const handler = (e) => {
      if (moodRef.current && !moodRef.current.contains(e.target)) setMoodOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [moodOpen]);

  // WebSocket connection for real-time COT push
  useEffect(() => {
    const token = localStorage.getItem("whisper_token");
    if (!token) return;

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${location.host}/ws/cot?token=${encodeURIComponent(token)}`;

    let ws;
    let reconnectTimer;
    let closed = false;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === "done") {
            setLiveRequestIds((prev) => {
              const next = new Set(prev);
              next.delete(msg.request_id);
              return next;
            });
            // Update token counts from done message
            if (msg.prompt_tokens || msg.completion_tokens) {
              setItems((prev) =>
                prev.map((it) =>
                  it.request_id === msg.request_id
                    ? { ...it, prompt_tokens: msg.prompt_tokens || 0, completion_tokens: msg.completion_tokens || 0 }
                    : it
                )
              );
            }
            return;
          }

          const { request_id, round_index, block_type, content, tool_name } = msg;

          setItems((prev) => {
            const idx = prev.findIndex((it) => it.request_id === request_id);
            if (idx >= 0) {
              const item = { ...prev[idx] };
              const rounds = [...item.rounds];
              const ri = rounds.findIndex((r) => r.round_index === round_index);
              if (ri >= 0) {
                rounds[ri] = {
                  ...rounds[ri],
                  blocks: [...rounds[ri].blocks, { block_type, content, tool_name }],
                };
              } else {
                rounds.push({ round_index, blocks: [{ block_type, content, tool_name }] });
                rounds.sort((a, b) => a.round_index - b.round_index);
              }
              item.rounds = rounds;
              if (block_type === "tool_use") item.has_tool_calls = true;
              if (block_type === "text" && !item.preview) item.preview = content.slice(0, 80);
              const next = [...prev];
              next[idx] = item;
              return next;
            }

            // New request - insert at top
            const now = new Date();
            const newItem = {
              request_id,
              created_at: now.toLocaleDateString("zh-CN", {
                month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
              }),
              preview: block_type === "text" ? content.slice(0, 80) : "",
              has_tool_calls: block_type === "tool_use",
              rounds: [{ round_index, blocks: [{ block_type, content, tool_name }] }],
            };
            return [newItem, ...prev];
          });

          // Mark as live and auto-expand
          setLiveRequestIds((prev) => new Set(prev).add(request_id));
          setExpandedId(request_id);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("chat_mode", mode);
    const saved = JSON.parse(localStorage.getItem("app-settings") || "{}");
    localStorage.setItem("app-settings", JSON.stringify({
      ...saved,
      shortMode: mode === "short",
      theaterMode: mode === "theater",
    }));
    apiFetch("/api/settings/chat-mode", {
      method: "PUT",
      body: { mode },
    }).catch(() => {});
  }, [mode]);

  const selectMood = (key) => {
    setMood(key);
    setMoodOpen(false);
    apiFetch("/api/settings/mood", { method: "PUT", body: { mood: key } }).catch(() => {});
  };

  const deleteCot = (item) => {
    setConfirm({
      message: "确定要删除这条 COT 记录吗？",
      action: async () => {
        try {
          await apiFetch(`/api/cot/${item.request_id}`, { method: "DELETE" });
          setItems((prev) => prev.filter((it) => it.request_id !== item.request_id));
        } catch (e) {
          console.error("Delete COT failed:", e);
        }
      },
    });
  };

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
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>COT 日志</h1>
        <div className="flex items-center gap-2">
          {wsConnected && (
            <div className="h-2 w-2 rounded-full" style={{ background: "#2a9d5c" }} title="实时连接" />
          )}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: S.bg, boxShadow: loading ? "var(--inset-shadow)" : "var(--card-shadow-sm)" }}
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={16} style={{ color: S.accentDark }} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Mood button + 3-segment mode selector */}
      <div className="shrink-0 pb-3" style={{ paddingLeft: 20, paddingRight: 20 }}>
        <div className="flex items-stretch gap-4 justify-center">
          {/* Mood selector */}
          <div className="relative flex" ref={moodRef}>
            <button
              className="flex w-[42px] shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: S.bg, boxShadow: "var(--inset-shadow)" }}
              onClick={() => mood && setMoodOpen(!moodOpen)}
            >
              {mood ? (
                <img
                  src={`/miniapp/assets/mood/${mood}.png`}
                  alt={mood}
                  className="h-6 w-6"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="h-6 w-6" />
              )}
            </button>
            {moodOpen && (
              <div
                className="absolute left-0 top-12 z-50 rounded-[16px] overflow-hidden"
                style={{
                  background: S.bg,
                  boxShadow: "var(--card-shadow-sm)",
                  width: 174,
                }}
              >
                {MOODS.map((m, i) => {
                  const row = Math.floor(i / 3);
                  const col = i % 3;
                  const selected = mood === m.key;
                  return (
                    <button
                      key={m.key}
                      className="inline-flex flex-col items-center justify-center"
                      style={{
                        width: "calc(100% / 3)",
                        padding: "8px 0 6px",
                        background: selected ? "rgba(232,160,191,0.18)" : "transparent",
                        boxShadow: [
                          col < 2 ? "inset -1px 0 0 rgba(136,136,160,0.12)" : "",
                          row < 2 ? "inset 0 -1px 0 rgba(136,136,160,0.12)" : "",
                        ].filter(Boolean).join(", ") || "none",
                      }}
                      onClick={() => selectMood(m.key)}
                    >
                      <img
                        src={`/miniapp/assets/mood/${m.key}.png`}
                        alt={m.label}
                        className="h-7 w-7"
                        style={{
                          imageRendering: "pixelated",
                          filter: selected ? "drop-shadow(0 0 3px #e8a0bf)" : "none",
                        }}
                      />
                      <span
                        className="text-[10px] mt-0.5"
                        style={{ color: selected ? "#d48aab" : S.textMuted }}
                      >
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* 3-segment mode selector */}
          <div
            className="flex rounded-[14px] p-1"
            style={{ boxShadow: "var(--inset-shadow)", background: S.bg, width: 240 }}
          >
            {MODES.map((m) => (
              <button
                key={m.key}
                className="flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition-all"
                style={{
                  background: mode === m.key ? S.bg : "transparent",
                  boxShadow: mode === m.key ? "var(--card-shadow-sm)" : "none",
                  color: mode === m.key ? S.accentDark : S.textMuted,
                }}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: S.accent, borderTopColor: "transparent" }} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Cpu size={36} style={{ color: "#ef4444", opacity: 0.5 }} />
            <p className="text-[14px]" style={{ color: "#ef4444" }}>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Cpu size={36} style={{ color: S.textMuted, opacity: 0.5 }} />
            <p className="text-[14px]" style={{ color: S.textMuted }}>暂无 COT 记录</p>
          </div>
        ) : (
          items.map((item) => (
            <SwipeRow key={item.request_id} onDelete={() => deleteCot(item)}>
              <CotCard
                item={item}
                expanded={expandedId === item.request_id}
                onToggle={() =>
                  setExpandedId(expandedId === item.request_id ? null : item.request_id)
                }
                live={liveRequestIds.has(item.request_id)}
                avatarUrl={avatarUrl}
              />
            </SwipeRow>
          ))
        )}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={async () => { try { await confirm.action(); } catch (e) { console.error(e); } setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
