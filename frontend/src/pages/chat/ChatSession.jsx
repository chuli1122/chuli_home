import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Square, Repeat, ChevronDown } from "lucide-react";
import { apiFetch, apiSSE } from "../../utils/api";

export default function ChatSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [mode, setMode] = useState("normal"); // 'normal' | 'short'
  const [modeTip, setModeTip] = useState("");
  const [pendingMessages, setPendingMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const abortRef = useRef(null);
  const streamContentRef = useRef("");

  // Load session info
  useEffect(() => {
    const loadSession = async () => {
      try {
        const data = await apiFetch("/api/sessions");
        const session = (data.sessions || []).find(
          (s) => s.id === Number(id)
        );
        setSessionInfo(session || null);
      } catch {}
    };
    loadSession();
  }, [id]);

  // Load messages
  const loadMessages = useCallback(async (before = null) => {
    try {
      let url = `/api/sessions/${id}/messages?limit=50`;
      if (before) url += `&before=${before}`;
      const data = await apiFetch(url);
      const msgs = (data.messages || []).filter(
        (m) => m.role === "user" || m.role === "assistant"
      );
      if (msgs.length < 50) setHasMore(false);
      if (before) {
        setMessages((prev) => [...msgs, ...prev]);
      } else {
        setMessages(msgs);
        if (msgs.length > 0) setCursor(msgs[0].id);
      }
      if (msgs.length > 0 && !before) {
        setCursor(msgs[0].id);
      } else if (msgs.length > 0 && before) {
        setCursor(msgs[0].id);
      }
    } catch (e) {
      console.error("Failed to load messages", e);
    }
  }, [id]);

  useEffect(() => {
    loadMessages();
    // Mark as read
    try {
      const map = JSON.parse(localStorage.getItem("session-read-times") || "{}");
      map[id] = Date.now();
      localStorage.setItem("session-read-times", JSON.stringify(map));
    } catch {}
  }, [id, loadMessages]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Scroll to load more
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el || !hasMore || loading) return;
    if (el.scrollTop < 50 && cursor) {
      loadMessages(cursor);
    }
  };

  const toggleMode = () => {
    const next = mode === "normal" ? "short" : "normal";
    setMode(next);
    setModeTip(next === "short" ? "已切换到短消息模式" : "已切换到普通模式");
    setTimeout(() => setModeTip(""), 2000);
  };

  // Normal mode: send + stream
  const sendNormal = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg = {
      id: Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Start streaming
    setStreaming(true);
    streamContentRef.current = "";
    const aiMsgId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);

    try {
      await apiSSE(
        "/api/chat/completions",
        { session_id: Number(id), message: text, stream: true },
        (chunk) => {
          if (chunk.content) {
            streamContentRef.current += chunk.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: streamContentRef.current }
                  : m
              )
            );
          }
        },
        () => {
          setStreaming(false);
          // Clean [[used:id]] markers from final content
          const clean = streamContentRef.current.replace(/\[\[used:\d+\]\]/g, "").trim();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: clean } : m
            )
          );
        }
      );
    } catch (e) {
      console.error("Streaming failed", e);
      setStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, content: streamContentRef.current || "(请求失败)" }
            : m
        )
      );
    }
  };

  const stopStream = () => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setStreaming(false);
  };

  // Short mode: just send (store locally)
  const sendShort = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const userMsg = {
      id: Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg]);
    setPendingMessages((prev) => [...prev, { role: "user", content: text }]);
  };

  // Short mode: collect and send to AI
  const collectAndSend = async () => {
    if (pendingMessages.length === 0 || loading) return;
    setLoading(true);
    try {
      const data = await apiFetch("/api/chat/completions", {
        method: "POST",
        body: {
          session_id: Number(id),
          messages: pendingMessages,
          stream: false,
        },
      });
      setPendingMessages([]);
      // Parse response: split by [NEXT]
      const responseMessages = data.messages || [];
      const lastAssistant = responseMessages
        .filter((m) => m.role === "assistant")
        .pop();
      if (lastAssistant && lastAssistant.content) {
        const parts = lastAssistant.content.split("[NEXT]").filter(Boolean);
        // Show parts one by one with delay
        for (let i = 0; i < parts.length; i++) {
          await new Promise((r) => setTimeout(r, i === 0 ? 0 : 1500));
          const clean = parts[i].replace(/\[\[used:\d+\]\]/g, "").trim();
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + i,
              role: "assistant",
              content: clean,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (e) {
      console.error("Collect send failed", e);
    }
    setLoading(false);
  };

  // Time separator logic
  const shouldShowTime = (msg, prevMsg) => {
    if (!prevMsg) return true;
    const t1 = new Date(prevMsg.created_at).getTime();
    const t2 = new Date(msg.created_at).getTime();
    return t2 - t1 > 5 * 60 * 1000;
  };

  const formatMsgTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--app-bg)]">
      {/* Header */}
      <div className="flex items-center px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2 border-b border-gray-200/40">
        <button
          onClick={() => navigate(-1)}
          className="mr-3 rounded-full p-1.5 active:bg-black/5"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-base font-semibold">
            {sessionInfo?.title || `会话 ${id}`}
          </h1>
          <span className="text-[10px] text-green-500">在线</span>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        onScroll={handleScroll}
      >
        {hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            <button
              onClick={() => cursor && loadMessages(cursor)}
              className="text-xs text-gray-400"
            >
              加载更多
            </button>
          </div>
        )}
        {messages.map((msg, i) => {
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showTime = shouldShowTime(msg, prevMsg);
          const isUser = msg.role === "user";
          return (
            <div key={msg.id || i}>
              {showTime && msg.created_at && (
                <div className="py-2 text-center text-[10px] text-gray-400">
                  {formatMsgTime(msg.created_at)}
                </div>
              )}
              <div
                className={`mb-2 flex ${
                  isUser ? "justify-end" : "justify-start"
                }`}
              >
                {!isUser && (
                  <div className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500 mt-0.5">
                    AI
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    isUser
                      ? "bg-black text-white rounded-br-md"
                      : "bg-white text-gray-800 rounded-bl-md shadow-sm"
                  }`}
                >
                  {msg.content || (streaming && !isUser ? "..." : "")}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Mode tip */}
      {modeTip && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-xs text-white">
          {modeTip}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-200/40 bg-white px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          {/* Mode toggle */}
          <button
            onClick={toggleMode}
            className="mb-1 rounded-full p-1.5 active:bg-gray-100"
            title={mode === "normal" ? "切换到短消息" : "切换到普通模式"}
          >
            <Repeat
              size={18}
              className={
                mode === "short" ? "text-blue-500" : "text-gray-400"
              }
            />
          </button>

          {/* Input */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            rows={1}
            className="flex-1 rounded-2xl border border-gray-200 px-3.5 py-2 text-sm outline-none resize-none max-h-24 overflow-y-auto"
            style={{
              height: Math.min(24 + input.split("\n").length * 20, 96),
            }}
          />

          {/* Action buttons */}
          {mode === "normal" ? (
            <button
              onClick={streaming ? stopStream : sendNormal}
              disabled={!streaming && !input.trim()}
              className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-black text-white disabled:opacity-30"
            >
              {streaming ? (
                <Square size={14} fill="white" />
              ) : (
                <Send size={14} />
              )}
            </button>
          ) : (
            <>
              <button
                onClick={sendShort}
                disabled={!input.trim()}
                className="mb-1 flex h-8 items-center justify-center rounded-full bg-black px-3 text-xs text-white disabled:opacity-30"
              >
                发送
              </button>
              <button
                onClick={collectAndSend}
                disabled={pendingMessages.length === 0 || loading}
                className="mb-1 flex h-8 items-center justify-center rounded-full bg-blue-500 px-3 text-xs text-white disabled:opacity-30"
              >
                {loading ? "..." : "收"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
