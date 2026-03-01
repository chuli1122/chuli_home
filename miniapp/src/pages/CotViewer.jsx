import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ChevronLeft, RefreshCw, Cpu } from "lucide-react";
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
  injected_memories: { bg: "rgba(80,180,120,0.12)", color: "#3a8a5f", label: "注入记忆" },
  text: { bg: "rgba(232,160,191,0.08)", color: "#c9628a", label: "回复" },
};

const MODES = [
  { key: "short", label: "短消息" },
  { key: "long", label: "长消息" },
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

/* ── Block chip ── */

function BlockChip({ block_type }) {
  const meta = BLOCK_COLORS[block_type] || { bg: "rgba(136,136,160,0.1)", color: S.textMuted, label: block_type };
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
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

/* ── Thinking block with translate ── */

function ThinkingBlock({ block, cacheKey, translateCache, collapsed }) {
  const cached = translateCache.current.get(cacheKey);
  const [translated, setTranslated] = useState(cached || null);
  const [showTranslated, setShowTranslated] = useState(!!cached);
  const [translating, setTranslating] = useState(false);
  const meta = BLOCK_COLORS.thinking;

  const handleTranslate = async (e) => {
    e.stopPropagation();
    if (translated) { setShowTranslated(!showTranslated); return; }
    setTranslating(true);
    try {
      const data = await apiFetch("/api/cot/translate", { method: "POST", body: { text: block.content } });
      setTranslated(data.translated);
      setShowTranslated(true);
      translateCache.current.set(cacheKey, data.translated);
    } catch (err) {
      console.error("Translation failed:", err);
      alert("翻译失败，请稍后重试");
    }
    finally { setTranslating(false); }
  };

  return (
    <div className="mb-2 rounded-[12px] p-3" style={{ background: meta.bg }}>
      <div className={collapsed ? "flex items-center gap-2" : "mb-1 flex items-center gap-2"}>
        <BlockChip block_type="thinking" />
        {collapsed && block.content && (
          <span className="flex-1 min-w-0 truncate text-[10px] font-mono opacity-85" style={{ color: "#8860c8" }}>
            {block.content.replace(/\n/g, " ").slice(0, 50)}
          </span>
        )}
        {!collapsed && (
          <>
            <span className="flex-1" />
            <button
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: "#1a7ab0", background: "rgba(80,160,200,0.15)" }}
              onClick={handleTranslate}
              disabled={translating}
            >
              {translating ? "翻译中..." : showTranslated ? "原文" : "翻译"}
            </button>
          </>
        )}
      </div>
      {!collapsed && <BlockContent content={showTranslated && translated ? translated : block.content} />}
    </div>
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

function fmtElapsed(ms) {
  if (!ms) return null;
  const sec = ms / 1000;
  return sec >= 100 ? `${Math.round(sec)}s` : `${sec.toFixed(1)}s`;
}

function TokenBadges({ prompt, completion, elapsedMs, hasToolCalls, cacheHit, totalInput }) {
  const hasAnyValue = prompt || completion || elapsedMs;
  if (!hasAnyValue && !hasToolCalls) return null;

  const promptBg = cacheHit ? "rgba(220,120,160,0.12)" : "rgba(80,160,120,0.12)";
  const promptColor = cacheHit ? "#d478a0" : "#3a8a5f";

  return (
    <>
      <span
        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
        style={{ background: promptBg, color: promptColor }}
      >
        ↑{fmtTokens(prompt)}{totalInput > 0 && totalInput !== prompt ? `/${fmtTokens(totalInput)}` : ""}
      </span>
      <span
        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
        style={{ background: "rgba(160,100,220,0.12)", color: "#8a5abf" }}
      >
        ↓{fmtTokens(completion)}
      </span>
      {elapsedMs ? (
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
          style={{ background: "rgba(200,140,60,0.12)", color: "#b8820a" }}
        >
          {fmtElapsed(elapsedMs)}
        </span>
      ) : null}
    </>
  );
}

function pairToolBlocks(blocks) {
  // Keep thinking/text in natural order, only interleave tool_use→tool_result pairs
  const nonTool = [];
  const toolUses = [];
  const toolResults = [];
  for (const b of blocks) {
    if (b.block_type === "tool_use") toolUses.push(b);
    else if (b.block_type === "tool_result") toolResults.push(b);
    else nonTool.push(b);
  }
  const paired = [];
  for (let i = 0; i < toolUses.length; i++) {
    paired.push(toolUses[i]);
    if (i < toolResults.length) paired.push(toolResults[i]);
  }
  for (let i = toolUses.length; i < toolResults.length; i++) {
    paired.push(toolResults[i]);
  }
  return [...nonTool, ...paired];
}

function InjectedMemoriesBlock({ memories }) {
  const [open, setOpen] = useState(false);
  if (!memories || memories.length === 0) return null;
  const meta = BLOCK_COLORS.injected_memories;
  return (
    <div className="mb-2 rounded-[12px] p-3" style={{ background: meta.bg }}>
      <button className="flex w-full items-center gap-2" onClick={() => setOpen(!open)}>
        <BlockChip block_type="injected_memories" />
        <span className="text-[10px] font-semibold" style={{ color: meta.color }}>
          ({memories.length}条)
        </span>
        {open ? <ChevronUp size={12} style={{ color: meta.color }} /> : <ChevronDown size={12} style={{ color: meta.color }} />}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {memories.map((m) => (
            <p key={m.id} className="text-[11px] leading-relaxed" style={{ color: S.text }}>
              <span style={{ color: meta.color, fontWeight: 600 }}>#{m.id}</span> {m.content}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function CotCard({ item, expanded, onToggle, live, avatarUrl, translateCache }) {
  const [expandedBlocks, setExpandedBlocks] = useState(new Set());
  const pointerStart = useRef(null);

  // Filter out "usage" blocks only; keep text blocks in natural position
  const displayRounds = item.rounds.map((round) => ({
    ...round,
    blocks: pairToolBlocks(round.blocks.filter((b) => b.block_type !== "usage")),
  })).filter((round) => round.blocks.length > 0);

  // Determine which block is currently streaming (auto-expand)
  const streamingBlockKey = useMemo(() => {
    if (!live || displayRounds.length === 0) return null;
    const lastRound = displayRounds[displayRounds.length - 1];
    for (let i = lastRound.blocks.length - 1; i >= 0; i--) {
      if (lastRound.blocks[i].block_type === "thinking" || lastRound.blocks[i].block_type === "text") {
        return `${lastRound.round_index}:${i}`;
      }
    }
    return null;
  }, [live, displayRounds]);

  // Collapse all blocks when streaming ends
  useEffect(() => {
    if (!live) setExpandedBlocks(new Set());
  }, [live]);

  const hasContent = displayRounds.length > 0 || (item.injectedMemories && item.injectedMemories.length > 0);

  // Pointer tracking for tap vs scroll detection
  const handlePointerDown = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e, blockKey) => {
    if (!pointerStart.current) return;
    if (e.target.closest("button")) { pointerStart.current = null; return; }
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    pointerStart.current = null;
    if (dx < 10 && dy < 10) {
      setExpandedBlocks((prev) => {
        const next = new Set(prev);
        if (next.has(blockKey)) next.delete(blockKey);
        else next.add(blockKey);
        return next;
      });
    }
  };

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
            <TokenBadges
              prompt={item.prompt_tokens || 0}
              completion={item.completion_tokens || 0}
              elapsedMs={item.elapsed_ms || 0}
              hasToolCalls={item.has_tool_calls}
              cacheHit={item.cache_hit}
              totalInput={item.total_input || 0}
            />
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

      {expanded && hasContent && (
        <div className="px-4 pb-4">
          {/* Injected memories */}
          <InjectedMemoriesBlock memories={item.injectedMemories} />

          {displayRounds.map((round) => (
            <div key={round.round_index} className="mb-3">
              {displayRounds.length > 1 && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-px flex-1" style={{ background: "rgba(136,136,160,0.15)" }} />
                  <span className="text-[10px] font-semibold" style={{ color: S.textMuted }}>
                    轮 {round.round_index + 1}
                  </span>
                  <div className="h-px flex-1" style={{ background: "rgba(136,136,160,0.15)" }} />
                </div>
              )}
              {round.blocks.map((block, i) => {
                const blockKey = `${round.round_index}:${i}`;
                const isBlockExpanded = expandedBlocks.has(blockKey) || blockKey === streamingBlockKey;

                if (block.block_type === "thinking") {
                  return (
                    <div
                      key={i}
                      onPointerDown={handlePointerDown}
                      onPointerUp={(e) => handlePointerUp(e, blockKey)}
                    >
                      <ThinkingBlock
                        block={block}
                        cacheKey={`${item.request_id}:${round.round_index}:${i}`}
                        translateCache={translateCache}
                        collapsed={!isBlockExpanded}
                      />
                    </div>
                  );
                }

                // Sanitize write_diary: only show title, hide content
                let displayContent = block.content;
                if (block.block_type === "tool_use" && block.tool_name === "write_diary") {
                  try {
                    const args = JSON.parse(block.content);
                    displayContent = `📝 ${args.title || ""}${args.unlock_at ? `\n🔒 ${args.unlock_at}` : ""}`;
                  } catch { /* keep original */ }
                }

                const meta = BLOCK_COLORS[block.block_type] || { bg: "rgba(136,136,160,0.08)", color: S.textMuted, label: block.block_type };
                return (
                  <div
                    key={i}
                    className="mb-2 rounded-[12px] p-3"
                    style={{ background: meta.bg }}
                    onPointerDown={handlePointerDown}
                    onPointerUp={(e) => handlePointerUp(e, blockKey)}
                  >
                    <div className={isBlockExpanded ? "mb-1 flex items-center gap-2" : "flex items-center gap-2"}>
                      <BlockChip block_type={block.block_type} />
                      {block.tool_name && (
                        <span className="text-[10px] font-mono" style={{ color: meta.color }}>
                          {block.tool_name}
                        </span>
                      )}
                      {!isBlockExpanded && block.block_type === "text" && displayContent && (
                        <span className="flex-1 min-w-0 truncate text-[10px] font-mono opacity-85" style={{ color: meta.color }}>
                          {displayContent.replace(/\n/g, " ").slice(0, 50)}
                        </span>
                      )}
                    </div>
                    {isBlockExpanded && <BlockContent content={displayContent} />}
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
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [mode, setMode] = useState(() =>
    localStorage.getItem("chat_mode") || "long"
  );
  const [pendingMode, setPendingMode] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveRequestIds, setLiveRequestIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const wsRef = useRef(null);
  const translateCacheRef = useRef(new Map());
  const [mood, setMood] = useState(null);
  const [moodOpen, setMoodOpen] = useState(false);
  const moodRef = useRef(null);
  const [pendingCount, setPendingCount] = useState(0);
  const manuallyCollapsedRef = useRef(new Set());
  const apiLoadedRef = useRef(false);
  const pendingWsMsgsRef = useRef([]);

  const [wsToken, setWsToken] = useState(() => localStorage.getItem("whisper_token"));

  const processWsMsg = useRef(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiLoadedRef.current = false;
    apiFetch("/api/cot?limit=100")
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        apiLoadedRef.current = true;
        const pending = pendingWsMsgsRef.current;
        pendingWsMsgsRef.current = [];
        if (pending.length > 0 && processWsMsg.current) {
          for (const msg of pending) processWsMsg.current(msg);
        }
      })
      .catch((err) => {
        console.error("COT load error:", err);
        setError(err.message || "加载失败");
        apiLoadedRef.current = true;
      })
      .finally(() => {
        setLoading(false);
        const t = localStorage.getItem("whisper_token");
        if (t && t !== wsToken) setWsToken(t);
      });
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

  // Load current mood + pending memory count
  useEffect(() => {
    apiFetch("/api/settings/mood")
      .then((data) => setMood(data.mood || "calm"))
      .catch(() => setMood("calm"));
    apiFetch("/api/pending-memories/count")
      .then((data) => setPendingCount(data.count || 0))
      .catch(() => {});
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
    if (!wsToken) {
      console.log("[COT WS] No token yet, waiting...");
      return;
    }

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${location.host}/ws/cot?token=${encodeURIComponent(wsToken)}`;
    console.log("[COT WS] Connecting to", wsUrl);

    let ws;
    let reconnectTimer;
    let closed = false;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[COT WS] Connected");
        setWsConnected(true);
      };

      const handleWsMsg = (msg) => {
          const { type, request_id } = msg;

          // Helper: ensure item exists, returns [newArray, itemIndex]
          const ensureItem = (prev) => {
            const idx = prev.findIndex((it) => it.request_id === request_id);
            if (idx >= 0) return [prev, idx];
            const now = new Date();
            const newItem = {
              request_id,
              created_at: now.toLocaleDateString("zh-CN", {
                month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
              }),
              preview: "思考中...",
              has_tool_calls: false,
              rounds: [],
              injectedMemories: [],
            };
            const next = [newItem, ...prev];
            return [next, 0];
          };

          // Helper: ensure round exists in rounds array
          const ensureRound = (rounds, roundIndex) => {
            const ri = rounds.findIndex((r) => r.round_index === roundIndex);
            if (ri >= 0) return [rounds, ri];
            const next = [...rounds, { round_index: roundIndex, blocks: [] }];
            next.sort((a, b) => a.round_index - b.round_index);
            return [next, next.findIndex((r) => r.round_index === roundIndex)];
          };

          // Auto-expand helper: only expand if not manually collapsed
          const autoExpand = (rid) => {
            if (!manuallyCollapsedRef.current.has(rid)) {
              setExpandedIds((prev) => {
                if (prev.has(rid)) return prev;
                const next = new Set(prev);
                next.add(rid);
                return next;
              });
            }
          };

          if (type === "tokens_update") {
            setItems((prev) =>
              prev.map((it) =>
                it.request_id === request_id
                  ? { ...it, prompt_tokens: msg.prompt_tokens || 0, completion_tokens: msg.completion_tokens || 0, cache_hit: msg.cache_hit || false, total_input: msg.total_input || 0 }
                  : it
              )
            );
            return;
          }

          if (type === "replay_snapshot") {
            console.log("[COT] replay_snapshot", request_id, "thinking_rounds:", msg.rounds?.length, "text_len:", (msg.text_preview || "").length);
            setItems((prev) => {
              let [arr, idx] = ensureItem(prev);
              arr = [...arr];
              const item = { ...arr[idx] };
              // Merge thinking from replay into rounds (replace if replay has more content)
              if (msg.rounds) {
                for (const r of msg.rounds) {
                  if (!r.thinking) continue;
                  let [rounds, ri] = ensureRound([...item.rounds], r.round_index);
                  const round = { ...rounds[ri], blocks: [...rounds[ri].blocks] };
                  const ti = round.blocks.findIndex((b) => b.block_type === "thinking");
                  if (ti >= 0) {
                    if (r.thinking.length > round.blocks[ti].content.length) {
                      round.blocks[ti] = { ...round.blocks[ti], content: r.thinking };
                    }
                  } else {
                    round.blocks.push({ block_type: "thinking", content: r.thinking, tool_name: null });
                  }
                  rounds[ri] = round;
                  item.rounds = rounds;
                }
              }
              // Insert text_preview as a text block in the last round
              if (msg.text_preview) {
                const lastRoundIdx = item.rounds.length > 0
                  ? item.rounds[item.rounds.length - 1].round_index
                  : 0;
                let [rounds2, ri2] = ensureRound([...item.rounds], lastRoundIdx);
                const round2 = { ...rounds2[ri2], blocks: [...rounds2[ri2].blocks] };
                const existingTextIdx = round2.blocks.findIndex((b) => b.block_type === "text");
                if (existingTextIdx >= 0) {
                  if (msg.text_preview.length > round2.blocks[existingTextIdx].content.length) {
                    round2.blocks[existingTextIdx] = { ...round2.blocks[existingTextIdx], content: msg.text_preview };
                  }
                } else {
                  round2.blocks.push({ block_type: "text", content: msg.text_preview, tool_name: null });
                }
                rounds2[ri2] = round2;
                item.rounds = rounds2;
                if (!item.preview || item.preview === "思考中...") {
                  item.preview = msg.text_preview.slice(0, 80);
                }
              }
              if (msg.injected_memories) item.injectedMemories = msg.injected_memories;
              if (msg.prompt_tokens) item.prompt_tokens = msg.prompt_tokens;
              if (msg.completion_tokens) item.completion_tokens = msg.completion_tokens;
              if (msg.cache_hit) item.cache_hit = msg.cache_hit;
              if (msg.total_input) item.total_input = msg.total_input;
              arr[idx] = item;
              return arr;
            });
            setLiveRequestIds((prev) => new Set(prev).add(request_id));
            autoExpand(request_id);
            return;
          }

          if (type === "done") {
            setLiveRequestIds((prev) => {
              const next = new Set(prev);
              next.delete(request_id);
              return next;
            });
            manuallyCollapsedRef.current.delete(request_id);
            setItems((prev) =>
              prev.map((it) =>
                it.request_id === request_id
                  ? { ...it, prompt_tokens: msg.prompt_tokens || 0, completion_tokens: msg.completion_tokens || 0, elapsed_ms: msg.elapsed_ms || 0, cache_hit: msg.cache_hit || false, total_input: msg.total_input || 0 }
                  : it
              )
            );
            return;
          }

          if (type === "injected_memories") {
            setItems((prev) => {
              let [arr, idx] = ensureItem(prev);
              arr = [...arr];
              arr[idx] = { ...arr[idx], injectedMemories: msg.memories || [] };
              return arr;
            });
            setLiveRequestIds((prev) => new Set(prev).add(request_id));
            autoExpand(request_id);
            return;
          }

          if (type === "thinking_delta") {
            setItems((prev) => {
              let [arr, idx] = ensureItem(prev);
              arr = [...arr];
              const item = { ...arr[idx] };
              let [rounds, ri] = ensureRound([...item.rounds], msg.round_index);
              const round = { ...rounds[ri], blocks: [...rounds[ri].blocks] };
              // Find last thinking block to append to
              let ti = -1;
              for (let i = round.blocks.length - 1; i >= 0; i--) {
                if (round.blocks[i].block_type === "thinking") { ti = i; break; }
              }
              if (ti >= 0) {
                round.blocks[ti] = { ...round.blocks[ti], content: round.blocks[ti].content + msg.content };
              } else {
                round.blocks.push({ block_type: "thinking", content: msg.content, tool_name: null });
              }
              rounds[ri] = round;
              item.rounds = rounds;
              arr[idx] = item;
              return arr;
            });
            setLiveRequestIds((prev) => new Set(prev).add(request_id));
            autoExpand(request_id);
            return;
          }

          if (type === "text_delta") {
            setItems((prev) => {
              let [arr, idx] = ensureItem(prev);
              arr = [...arr];
              const item = { ...arr[idx] };
              let [rounds, ri] = ensureRound([...item.rounds], msg.round_index);
              const round = { ...rounds[ri], blocks: [...rounds[ri].blocks] };
              // Find last text block to append to
              let ti = -1;
              for (let i = round.blocks.length - 1; i >= 0; i--) {
                if (round.blocks[i].block_type === "text") { ti = i; break; }
              }
              if (ti >= 0) {
                round.blocks[ti] = { ...round.blocks[ti], content: round.blocks[ti].content + msg.content };
              } else {
                round.blocks.push({ block_type: "text", content: msg.content, tool_name: null });
              }
              rounds[ri] = round;
              item.rounds = rounds;
              // Update card preview
              const allText = rounds.flatMap((r) => r.blocks.filter((b) => b.block_type === "text")).map((b) => b.content).join("");
              if (!item.preview || item.preview === "思考中...") {
                item.preview = allText.slice(0, 80);
              }
              arr[idx] = item;
              return arr;
            });
            setLiveRequestIds((prev) => new Set(prev).add(request_id));
            autoExpand(request_id);
            return;
          }

          if (type === "tool_use" || type === "tool_result") {
            setItems((prev) => {
              let [arr, idx] = ensureItem(prev);
              arr = [...arr];
              const item = { ...arr[idx] };
              let [rounds, ri] = ensureRound([...item.rounds], msg.round_index);
              rounds[ri] = { ...rounds[ri], blocks: [...rounds[ri].blocks, { block_type: type, content: msg.content, tool_name: msg.tool_name }] };
              item.rounds = rounds;
              if (type === "tool_use") item.has_tool_calls = true;
              arr[idx] = item;
              return arr;
            });
            setLiveRequestIds((prev) => new Set(prev).add(request_id));
            autoExpand(request_id);
            return;
          }

          // Backward compat: complete block types (thinking, text) from non-streaming path
          if (msg.block_type) {
            const { round_index, block_type, content, tool_name } = msg;
            setItems((prev) => {
              let [arr, idx] = ensureItem(prev);
              arr = [...arr];
              const item = { ...arr[idx] };
              let [rounds, ri] = ensureRound([...item.rounds], round_index);
              rounds[ri] = { ...rounds[ri], blocks: [...rounds[ri].blocks, { block_type, content, tool_name }] };
              item.rounds = rounds;
              if (block_type === "tool_use") item.has_tool_calls = true;
              if (block_type === "text" && (!item.preview || item.preview === "思考中...")) item.preview = content.slice(0, 80);
              arr[idx] = item;
              return arr;
            });
            setLiveRequestIds((prev) => new Set(prev).add(request_id));
            autoExpand(request_id);
          }
      };

      processWsMsg.current = handleWsMsg;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (!apiLoadedRef.current) {
            pendingWsMsgsRef.current.push(msg);
            return;
          }
          handleWsMsg(msg);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = (e) => {
        console.log("[COT WS] Disconnected, code:", e.code, "reason:", e.reason);
        setWsConnected(false);
        wsRef.current = null;
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (e) => {
        console.error("[COT WS] Error:", e);
        ws.close();
      };
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
  }, [wsToken]);

  const modeInitRef = useRef(true);
  useEffect(() => {
    if (modeInitRef.current) {
      modeInitRef.current = false;
      return;
    }
    localStorage.setItem("chat_mode", mode);
    const saved = JSON.parse(localStorage.getItem("app-settings") || "{}");
    localStorage.setItem("app-settings", JSON.stringify({
      ...saved,
      shortMode: mode === "short",
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

  return (
    <div className="flex h-full flex-col" style={{ background: S.bg }}>
      {/* Header */}
      <div
        className="relative flex shrink-0 items-center justify-between px-5 pb-3"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}
          onClick={() => navigate("/", { replace: true })}
        >
          <ChevronLeft size={22} style={{ color: S.text }} />
        </button>
        <h1 className="absolute inset-x-0 text-center text-[17px] font-bold pointer-events-none" style={{ color: S.text }}>COT 日志</h1>
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
            style={{ boxShadow: "var(--inset-shadow)", background: S.bg, width: 160 }}
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
                onClick={() => {
                  if (m.key !== mode) setPendingMode(m.key);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          {/* Pending memories button */}
          <div className="relative flex">
            <button
              className="flex w-[42px] shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: S.bg, boxShadow: "var(--inset-shadow)" }}
              onClick={() => navigate("/pending-memories")}
            >
              <img
                src="/miniapp/assets/decorations/翻盖机.png"
                alt="摘要提取记忆"
                className="h-6"
                style={{ imageRendering: "pixelated", objectFit: "contain" }}
              />
            </button>
            {pendingCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                style={{ background: "#ef4444" }}
              >
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-5">
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
            <div key={item.request_id} className="mb-3 rounded-[18px]" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)" }}>
              <CotCard
                item={item}
                expanded={expandedIds.has(item.request_id)}
                onToggle={() => {
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.request_id)) {
                      next.delete(item.request_id);
                      manuallyCollapsedRef.current.add(item.request_id);
                    } else {
                      next.add(item.request_id);
                      manuallyCollapsedRef.current.delete(item.request_id);
                    }
                    return next;
                  });
                }}
                live={liveRequestIds.has(item.request_id)}
                avatarUrl={avatarUrl}
                translateCache={translateCacheRef}
              />
            </div>
          ))
        )}
      </div>

      {/* Mode switch confirm dialog */}
      {pendingMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.25)" }} onClick={() => setPendingMode(null)}>
          <div className="mx-6 w-full max-w-[300px] rounded-[22px] p-6" style={{ background: S.bg, boxShadow: "0 8px 30px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-center text-[16px] font-bold" style={{ color: S.text }}>切换模式</p>
            <p className="mb-5 text-center text-[13px]" style={{ color: S.textMuted }}>
              确认切换到{MODES.find((m) => m.key === pendingMode)?.label || pendingMode}模式？
            </p>
            <div className="flex gap-3">
              <button className="flex-1 rounded-[16px] py-3 text-[15px] font-semibold" style={{ background: S.bg, boxShadow: "var(--card-shadow-sm)", color: S.text }} onClick={() => setPendingMode(null)}>取消</button>
              <button className="flex-1 rounded-[16px] py-3 text-[15px] font-semibold text-white" style={{ background: S.accentDark, boxShadow: `4px 4px 10px rgba(201,98,138,0.4)` }} onClick={() => { setMode(pendingMode); setPendingMode(null); }}>确认</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
