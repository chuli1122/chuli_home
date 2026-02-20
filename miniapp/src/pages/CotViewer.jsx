import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ChevronLeft, Wrench, MessageSquare, RefreshCw, Cpu } from "lucide-react";
import { apiFetch } from "../utils/api";

const S = {
  bg: "var(--bg)",
  accent: "var(--accent)",
  accentDark: "var(--accent-dark)",
  text: "var(--text)",
  textMuted: "var(--text-muted)",
};

const BLOCK_COLORS = {
  thinking: { bg: "rgba(168,130,200,0.12)", color: "#8860c8", label: "思考" },
  text: { bg: "rgba(100,170,120,0.12)", color: "#3a9b5c", label: "回复" },
  tool_use: { bg: "rgba(232,160,60,0.12)", color: "#b8820a", label: "工具调用" },
  tool_result: { bg: "rgba(80,160,200,0.12)", color: "#1a7ab0", label: "工具结果" },
};

const MODES = [
  { key: "short", label: "短消息" },
  { key: "long", label: "长消息" },
  { key: "theater", label: "小剧场" },
];

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

function CotCard({ item, expanded, onToggle, live }) {
  return (
    <div
      className="mb-3 rounded-[18px] overflow-hidden"
      style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
    >
      <button className="flex w-full items-center gap-3 p-4" onClick={onToggle}>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ boxShadow: "var(--icon-inset)", background: S.bg }}
        >
          {item.has_tool_calls ? (
            <Wrench size={15} style={{ color: "#b8820a" }} />
          ) : (
            <MessageSquare size={15} style={{ color: S.accentDark }} />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            {live && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: S.accentDark }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: S.accentDark }} />
              </span>
            )}
            {item.has_tool_calls && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                style={{ background: "rgba(232,160,60,0.15)", color: "#b8820a" }}
              >
                工具
              </span>
            )}
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

      {expanded && (
        <div className="px-4 pb-4">
          {item.rounds.map((round) => (
            <div key={round.round_index} className="mb-3">
              {item.rounds.length > 1 && (
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
                    <p
                      className="whitespace-pre-wrap break-words text-[12px] leading-relaxed"
                      style={{ color: S.text, maxHeight: 200, overflow: "hidden" }}
                    >
                      {block.content.length > 500 ? block.content.slice(0, 500) + "..." : block.content}
                    </p>
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
  const wsRef = useRef(null);

  const load = () => {
    setLoading(true);
    apiFetch("/api/cot?limit=30")
      .then((data) => setItems(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
    // sync with app-settings for other pages
    const saved = JSON.parse(localStorage.getItem("app-settings") || "{}");
    localStorage.setItem("app-settings", JSON.stringify({
      ...saved,
      shortMode: mode === "short",
      theaterMode: mode === "theater",
    }));
    // sync to backend so Telegram bot picks it up
    apiFetch("/api/settings/chat-mode", {
      method: "PUT",
      body: { mode },
    }).catch(() => {});
  }, [mode]);

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

      {/* 3-segment mode selector */}
      <div className="shrink-0 px-5 pb-3">
        <div
          className="flex rounded-[14px] p-1"
          style={{ boxShadow: "var(--inset-shadow)", background: S.bg }}
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

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: S.accent, borderTopColor: "transparent" }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Cpu size={36} style={{ color: S.textMuted, opacity: 0.5 }} />
            <p className="text-[14px]" style={{ color: S.textMuted }}>暂无 COT 记录</p>
          </div>
        ) : (
          items.map((item) => (
            <CotCard
              key={item.request_id}
              item={item}
              expanded={expandedId === item.request_id}
              onToggle={() =>
                setExpandedId(expandedId === item.request_id ? null : item.request_id)
              }
              live={liveRequestIds.has(item.request_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
