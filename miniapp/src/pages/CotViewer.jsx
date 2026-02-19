import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronDown, ChevronUp, Wrench, MessageSquare, RefreshCw, Cpu } from "lucide-react";
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

function CotCard({ item, expanded, onToggle }) {
  return (
    <div
      className="mb-3 rounded-[18px] overflow-hidden"
      style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
    >
      {/* Header */}
      <button
        className="flex w-full items-center gap-3 p-4"
        onClick={onToggle}
      >
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

      {/* Expanded content */}
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
                  <div
                    key={i}
                    className="mb-2 rounded-[12px] p-3"
                    style={{ background: meta.bg }}
                  >
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
  const [shortMode, setShortMode] = useState(() =>
    localStorage.getItem("cot_short_mode") === "true"
  );

  const load = () => {
    setLoading(true);
    apiFetch("/api/cot?limit=30")
      .then((data) => setItems(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    localStorage.setItem("cot_short_mode", String(shortMode));
    // Also update the main app setting
    const saved = JSON.parse(localStorage.getItem("app-settings") || "{}");
    localStorage.setItem("app-settings", JSON.stringify({ ...saved, shortMode }));
  }, [shortMode]);

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
          onClick={() => navigate("/")}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="text-[17px] font-bold" style={{ color: S.text }}>COT 日志</h1>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: loading ? "var(--inset-shadow)" : "var(--card-shadow-sm)" }}
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={16} style={{ color: S.accentDark }} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="flex shrink-0 items-center gap-3 px-5 pb-3">
        <div
          className="flex flex-1 items-center justify-between rounded-[14px] px-4 py-3"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
        >
          <div>
            <div className="text-[13px] font-semibold" style={{ color: S.text }}>短消息模式</div>
            <div className="text-[10px]" style={{ color: S.textMuted }}>开启后对话仅保留最近8条</div>
          </div>
          <button
            className="relative flex h-7 w-12 shrink-0 items-center rounded-full"
            style={{
              boxShadow: "var(--inset-shadow)",
              background: shortMode ? "var(--accent)" : S.bg,
              transition: "background 0.2s",
            }}
            onClick={() => setShortMode(!shortMode)}
          >
            <span
              className="absolute h-5 w-5 rounded-full"
              style={{
                left: shortMode ? "calc(100% - 22px)" : "2px",
                background: "white",
                boxShadow: "2px 2px 5px rgba(174,176,182,0.5)",
                transition: "left 0.2s ease",
              }}
            />
          </button>
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
            />
          ))
        )}
      </div>
    </div>
  );
}
