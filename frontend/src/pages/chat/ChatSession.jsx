import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Send, Square, Repeat, ChevronDown, Search, X,
  Image, File, Smile, MessageSquare, Palette, Plus, Inbox,
} from "lucide-react";
import { apiFetch, apiSSE } from "../../utils/api";
import { loadImageUrl, getAllStickers, addSticker, removeSticker } from "../../utils/db";

const MOODS = [
  { key: "happy", label: "开心" },
  { key: "sad", label: "难过" },
  { key: "angry", label: "生气" },
  { key: "anxious", label: "焦虑" },
  { key: "tired", label: "疲惫" },
  { key: "emo", label: "低落" },
  { key: "flirty", label: "心动" },
  { key: "proud", label: "得意" },
  { key: "calm", label: "平静" },
];

export default function ChatSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [mode, setMode] = useState("normal");
  const [modeTip, setModeTip] = useState("");
  const [pendingMessages, setPendingMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const abortRef = useRef(null);
  const streamContentRef = useRef("");

  // Mood
  const [currentMood, setCurrentMood] = useState(null);
  const [showMoodPicker, setShowMoodPicker] = useState(false);

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Toolbar & panels
  const [showToolbar, setShowToolbar] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [stickerUrls, setStickerUrls] = useState({});

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const stickerInputRef = useRef(null);

  // Assistant avatar
  const [assistantAvatar, setAssistantAvatar] = useState(null);

  // Load session info + mood
  useEffect(() => {
    const loadSession = async () => {
      try {
        const data = await apiFetch("/api/sessions");
        const session = (data.sessions || []).find((s) => s.id === Number(id));
        setSessionInfo(session || null);
        if (session?.mood) setCurrentMood(session.mood);
        // Load assistant avatar
        if (session?.assistant_id) {
          try {
            const a = await apiFetch(`/api/assistants/${session.assistant_id}`);
            if (a.avatar_url) {
              const url = await loadImageUrl(a.avatar_url);
              if (url) setAssistantAvatar(url);
            }
          } catch {}
        }
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
      }
      if (msgs.length > 0) setCursor(msgs[0].id);
    } catch (e) {
      console.error("Failed to load messages", e);
    }
  }, [id]);

  useEffect(() => {
    loadMessages();
    try {
      const map = JSON.parse(localStorage.getItem("session-read-times") || "{}");
      map[id] = Date.now();
      localStorage.setItem("session-read-times", JSON.stringify(map));
    } catch {}
  }, [id, loadMessages]);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Scroll handler: load more + show/hide scroll-to-bottom
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Scroll to bottom button
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!nearBottom);
    // Load more
    if (!hasMore || loading) return;
    if (el.scrollTop < 50 && cursor) loadMessages(cursor);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Mode toggle
  const toggleMode = () => {
    const next = mode === "normal" ? "short" : "normal";
    setMode(next);
    setModeTip(next === "short" ? "已切换到短消息模式" : "已切换到普通模式");
    setTimeout(() => setModeTip(""), 2000);
  };

  // Mood
  const selectMood = async (key) => {
    setCurrentMood(key);
    setShowMoodPicker(false);
    try {
      await apiFetch(`/api/sessions/${id}`, {
        method: "PUT",
        body: { mood: key },
      });
    } catch {}
  };

  // Search
  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch(`/api/sessions/${id}/messages?limit=50`);
      const all = (data.messages || []).filter(
        (m) => (m.role === "user" || m.role === "assistant") &&
          m.content && m.content.includes(searchQuery.trim())
      );
      setSearchResults(all);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  const jumpToMessage = (msgId) => {
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.background = "var(--chat-accent)";
      el.style.transition = "background 0.3s";
      setTimeout(() => { el.style.background = ""; }, 1500);
    }
  };

  // Stickers
  const loadStickers = async () => {
    const all = await getAllStickers();
    setStickers(all);
    const urls = {};
    for (const s of all) {
      if (s.blob) urls[s.key] = URL.createObjectURL(s.blob);
    }
    setStickerUrls(urls);
  };

  const openStickerPanel = () => {
    setShowToolbar(false);
    setShowStickerPanel(true);
    loadStickers();
  };

  const handleAddSticker = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await addSticker(file);
    loadStickers();
    e.target.value = "";
  };

  const selectSticker = (stickerKey) => {
    const url = stickerUrls[stickerKey];
    if (url) {
      setAttachments((prev) => [...prev, { type: "sticker", key: stickerKey, url }]);
    }
    setShowStickerPanel(false);
  };

  // Attachments
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAttachments((prev) => [...prev, { type: "image", file, url, name: file.name }]);
    setShowToolbar(false);
    e.target.value = "";
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachments((prev) => [...prev, {
      type: "file", file, name: file.name,
      size: (file.size / 1024).toFixed(1) + " KB",
    }]);
    setShowToolbar(false);
    e.target.value = "";
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Send helpers
  const sendNormal = async () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (streaming) return;
    setInput("");
    const content = text || (attachments.length > 0 ? "[附件]" : "");
    const userMsg = {
      id: Date.now(),
      role: "user",
      content,
      created_at: new Date().toISOString(),
      attachments: attachments.length > 0 ? attachments.map((a) => ({
        type: a.type, name: a.name, url: a.url,
      })) : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setAttachments([]);

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
                m.id === aiMsgId ? { ...m, content: streamContentRef.current } : m
              )
            );
          }
        },
        () => {
          setStreaming(false);
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
      const responseMessages = data.messages || [];
      const lastAssistant = responseMessages
        .filter((m) => m.role === "assistant")
        .pop();
      if (lastAssistant && lastAssistant.content) {
        const parts = lastAssistant.content.split("[NEXT]").filter(Boolean);
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

  // Time separator
  const shouldShowTime = (msg, prevMsg) => {
    if (!prevMsg) return true;
    const t1 = new Date(prevMsg.created_at).getTime();
    const t2 = new Date(msg.created_at).getTime();
    return t2 - t1 > 5 * 60 * 1000;
  };

  const formatMsgTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  };

  const moodIcon = currentMood || "calm";

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--chat-bg)" }}>
      {/* Header */}
      <div
        className="flex items-center px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2"
        style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(228,160,184,0.2)" }}
      >
        <button
          onClick={() => navigate("/chat/messages", { replace: true })}
          className="rounded-full p-1.5 active:opacity-60"
        >
          <ArrowLeft size={20} style={{ color: "var(--chat-text)" }} />
        </button>

        {/* Mood icon */}
        <button
          onClick={() => setShowMoodPicker(!showMoodPicker)}
          className="ml-1 h-8 w-8 rounded-full overflow-hidden active:scale-90 transition"
        >
          <img
            src={`/assets/mood/${moodIcon}.png`}
            alt={moodIcon}
            className="h-full w-full object-contain"
          />
        </button>

        {/* Title */}
        <h1
          className="flex-1 text-center text-base font-semibold truncate px-2"
          style={{ color: "var(--chat-text)" }}
        >
          {sessionInfo?.title || `会话 ${id}`}
        </h1>

        {/* Mode toggle */}
        <button
          onClick={toggleMode}
          className="rounded-full p-1.5 active:opacity-60"
          title={mode === "normal" ? "切换到短消息" : "切换到普通模式"}
        >
          <Repeat
            size={17}
            style={{ color: mode === "short" ? "var(--chat-accent-dark)" : "var(--chat-text-muted)" }}
          />
        </button>

        {/* Search */}
        <button
          onClick={() => setShowSearch(true)}
          className="rounded-full p-1.5 active:opacity-60"
        >
          <Search size={17} style={{ color: "var(--chat-text-muted)" }} />
        </button>
      </div>

      {/* Mood Picker */}
      {showMoodPicker && (
        <div
          className="absolute top-[calc(3.5rem+env(safe-area-inset-top))] left-3 right-3 z-50 rounded-2xl p-3 animate-slide-in"
          style={{ background: "var(--chat-card-bg)", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}
        >
          <div className="mood-grid">
            {MOODS.map((m) => (
              <button
                key={m.key}
                onClick={() => selectMood(m.key)}
                className="flex flex-col items-center gap-1 rounded-xl p-2 active:scale-90 transition"
                style={{
                  background: currentMood === m.key ? "var(--chat-input-bg)" : "transparent",
                }}
              >
                <img
                  src={`/assets/mood/${m.key}.png`}
                  alt={m.label}
                  className="h-10 w-10 object-contain"
                />
                <span className="text-[11px]" style={{ color: "var(--chat-text)" }}>
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Overlay */}
      {showSearch && (
        <div
          className="absolute inset-0 z-50 flex flex-col animate-slide-up"
          style={{ background: "var(--chat-bg)" }}
        >
          <div className="flex items-center gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
            <div
              className="flex flex-1 items-center gap-2 rounded-full px-4 py-2.5"
              style={{ background: "var(--chat-card-bg)" }}
            >
              <Search size={16} style={{ color: "var(--chat-text-muted)" }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="搜索聊天记录..."
                className="flex-1 text-base outline-none bg-transparent"
                style={{ color: "var(--chat-text)" }}
                autoFocus
              />
            </div>
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); }}
              className="text-sm px-2 active:opacity-60"
              style={{ color: "var(--chat-accent-dark)" }}
            >
              取消
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4">
            {searching && (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "var(--chat-accent)", borderTopColor: "var(--chat-accent-dark)" }} />
              </div>
            )}
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => jumpToMessage(r.id)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:opacity-70"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs"
                  style={{
                    background: r.role === "user" ? "var(--chat-accent)" : "var(--chat-input-bg)",
                    color: r.role === "user" ? "white" : "var(--chat-text)",
                  }}
                >
                  {r.role === "user" ? "我" : "AI"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm" style={{ color: "var(--chat-text)" }}>{r.content}</p>
                  <span className="text-[10px]" style={{ color: "var(--chat-text-muted)" }}>
                    {formatMsgTime(r.created_at)}
                  </span>
                </div>
              </button>
            ))}
            {!searching && searchResults.length === 0 && searchQuery && (
              <p className="py-8 text-center text-sm" style={{ color: "var(--chat-text-muted)" }}>
                未找到匹配的聊天记录
              </p>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 relative"
        onScroll={handleScroll}
      >
        {hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            <button
              onClick={() => cursor && loadMessages(cursor)}
              className="text-xs"
              style={{ color: "var(--chat-text-muted)" }}
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
            <div key={msg.id || i} id={`msg-${msg.id}`}>
              {showTime && msg.created_at && (
                <div className="py-2 text-center text-[10px]" style={{ color: "var(--chat-text-muted)" }}>
                  {formatMsgTime(msg.created_at)}
                </div>
              )}
              <div className={`mb-2.5 flex ${isUser ? "justify-end" : "justify-start"} animate-bubble`}>
                {!isUser && (
                  <div className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full overflow-hidden mt-0.5"
                    style={{ background: "var(--chat-input-bg)" }}
                  >
                    {assistantAvatar ? (
                      <img src={assistantAvatar} alt="AI" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs" style={{ color: "var(--chat-accent-dark)" }}>AI</span>
                    )}
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isUser ? "rounded-br-md" : "rounded-bl-md"
                  }`}
                  style={{
                    background: isUser ? "var(--chat-accent-dark)" : "var(--chat-card-bg)",
                    color: isUser ? "white" : "var(--chat-text)",
                  }}
                >
                  {/* Attachment images */}
                  {msg.attachments?.map((att, ai) => (
                    att.type === "image" || att.type === "sticker" ? (
                      <img key={ai} src={att.url} alt="" className="max-w-full rounded-lg mb-1" style={{ maxHeight: 200 }} />
                    ) : att.type === "file" ? (
                      <div key={ai} className="flex items-center gap-2 rounded-lg px-2 py-1 mb-1 text-xs" style={{ background: "rgba(0,0,0,0.1)" }}>
                        <File size={14} /> {att.name}
                      </div>
                    ) : null
                  ))}
                  {msg.content || (streaming && !isUser ? "..." : "")}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full shadow-lg active:scale-90 transition"
          style={{
            bottom: "calc(5rem + env(safe-area-inset-bottom))",
            background: "var(--chat-card-bg)",
          }}
        >
          <ChevronDown size={18} style={{ color: "var(--chat-accent-dark)" }} />
        </button>
      )}

      {/* Mode tip */}
      {modeTip && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs text-white z-40"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))", background: "var(--chat-accent-dark)", opacity: 0.9 }}
        >
          {modeTip}
        </div>
      )}

      {/* Sticker Panel */}
      {showStickerPanel && (
        <div
          className="animate-slide-up rounded-t-2xl"
          style={{ background: "var(--chat-card-bg)", maxHeight: 280 }}
        >
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-sm font-medium" style={{ color: "var(--chat-text)" }}>表情包</span>
            <button onClick={() => setShowStickerPanel(false)} className="p-1 active:opacity-60">
              <X size={18} style={{ color: "var(--chat-text-muted)" }} />
            </button>
          </div>
          <div className="sticker-grid overflow-y-auto px-2 pb-2" style={{ maxHeight: 220 }}>
            {/* Add button */}
            <button
              onClick={() => stickerInputRef.current?.click()}
              className="flex h-16 w-full items-center justify-center rounded-xl"
              style={{ background: "var(--chat-input-bg)", border: "1px dashed var(--chat-accent)" }}
            >
              <Plus size={22} style={{ color: "var(--chat-accent-dark)" }} />
            </button>
            <input ref={stickerInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddSticker} />
            {stickers.map((s) => (
              <button
                key={s.key}
                onClick={() => selectSticker(s.key)}
                className="h-16 w-full rounded-xl overflow-hidden active:scale-90 transition"
                style={{ background: "var(--chat-input-bg)" }}
              >
                {stickerUrls[s.key] && (
                  <img src={stickerUrls[s.key]} alt="" className="h-full w-full object-contain" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div
        className="px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
        style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(228,160,184,0.2)" }}
      >
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {attachments.map((att, i) => (
              <div key={i} className="relative shrink-0 rounded-xl overflow-hidden" style={{ background: "var(--chat-input-bg)" }}>
                {(att.type === "image" || att.type === "sticker") ? (
                  <img src={att.url} alt="" className="h-12 w-12 object-cover rounded-xl" />
                ) : (
                  <div className="flex items-center gap-1 px-2 py-2 text-[10px]" style={{ color: "var(--chat-text)" }}>
                    <File size={12} />
                    <span className="max-w-[60px] truncate">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-white text-[10px]"
                  style={{ background: "var(--chat-accent-dark)" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar panel */}
        {showToolbar && (
          <div className="flex justify-around py-2 mb-1 rounded-xl animate-panel-expand" style={{ background: "var(--chat-input-bg)" }}>
            <button onClick={() => imageInputRef.current?.click()} className="toolbar-icon-btn flex-1">
              <Image size={20} style={{ color: "var(--chat-accent-dark)" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>图片</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="toolbar-icon-btn flex-1">
              <File size={20} style={{ color: "var(--chat-accent-dark)" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>文件</span>
            </button>
            <button onClick={openStickerPanel} className="toolbar-icon-btn flex-1">
              <Smile size={20} style={{ color: "var(--chat-accent-dark)" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>表情包</span>
            </button>
            <button onClick={() => { setShowToolbar(false); alert("气泡设置开发中"); }} className="toolbar-icon-btn flex-1">
              <MessageSquare size={20} style={{ color: "var(--chat-accent-dark)" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>气泡</span>
            </button>
            <button onClick={() => { setShowToolbar(false); alert("背景设置开发中"); }} className="toolbar-icon-btn flex-1">
              <Palette size={20} style={{ color: "var(--chat-accent-dark)" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>背景</span>
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          {/* Toolbar toggle */}
          <button
            onClick={() => { setShowToolbar(!showToolbar); setShowStickerPanel(false); }}
            className="mb-1 rounded-full p-1.5 active:scale-90 transition"
          >
            <Plus
              size={20}
              style={{
                color: showToolbar ? "var(--chat-accent-dark)" : "var(--chat-text-muted)",
                transform: showToolbar ? "rotate(45deg)" : "none",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {/* Input */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            rows={1}
            className="flex-1 rounded-2xl px-3.5 py-2 text-base outline-none resize-none max-h-24 overflow-y-auto"
            style={{
              background: "var(--chat-input-bg)",
              color: "var(--chat-text)",
              border: "1px solid var(--chat-accent)",
              height: Math.min(24 + input.split("\n").length * 20, 96),
            }}
          />

          {/* Action buttons */}
          {mode === "normal" ? (
            <button
              onClick={streaming ? stopStream : sendNormal}
              disabled={!streaming && !input.trim() && attachments.length === 0}
              className="mb-1 flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-30 active:scale-90 transition"
              style={{ background: "var(--chat-accent-dark)" }}
            >
              {streaming ? <Square size={14} fill="white" /> : <Send size={14} />}
            </button>
          ) : (
            <>
              <button
                onClick={sendShort}
                disabled={!input.trim()}
                className="mb-1 flex h-9 items-center justify-center rounded-full px-3 text-xs text-white disabled:opacity-30 active:scale-90 transition"
                style={{ background: "var(--chat-accent-dark)" }}
              >
                发送
              </button>
              <button
                onClick={collectAndSend}
                disabled={pendingMessages.length === 0 || loading}
                className="mb-1 flex h-9 items-center justify-center rounded-full px-3 text-xs text-white disabled:opacity-30 active:scale-90 transition"
                style={{ background: "var(--chat-accent)" }}
              >
                <Inbox size={14} className="mr-1" />
                {loading ? "..." : "收"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
