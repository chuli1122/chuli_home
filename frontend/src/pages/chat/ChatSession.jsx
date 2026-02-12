import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Send, Square, Repeat, ChevronDown, Search, X,
  Image, File, Smile, MessageSquare, Palette, Plus, Inbox,
} from "lucide-react";
import { apiFetch, apiSSE } from "../../utils/api";
import { loadImageUrl, getAllStickers, addSticker, removeSticker } from "../../utils/db";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";

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
  const loadingRef = useRef(false);
  const cursorRef = useRef(null);
  const hasMoreRef = useRef(true);
  const scrollRestoreRef = useRef(null);
  const shouldScrollToBottomRef = useRef(false);
  const scrollTimerRef = useRef(null);

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

  // Avatars + model name + display title
  const [assistantAvatar, setAssistantAvatar] = useState(null);
  const [userAvatar, setUserAvatar] = useState(null);
  const [modelName, setModelName] = useState("");
  const [assistantName, setAssistantName] = useState("");
  const [pageReady, setPageReady] = useState(false);

  // Context menu for long-press
  const [contextMenu, setContextMenu] = useState(null); // { x, y, message }
  const longPressTimer = useRef(null);
  const longPressPos = useRef({ x: 0, y: 0 });

  // Quote reference
  const [quotedMessage, setQuotedMessage] = useState(null);

  // Edit modal
  const [editingMessage, setEditingMessage] = useState(null);
  const [editContent, setEditContent] = useState("");

  // Delete confirmation
  const [deletingMessage, setDeletingMessage] = useState(null);

  // Input ref for scroll into view
  const inputAreaRef = useRef(null);

  // Load session info + mood + model name + assistant name + avatars
  useEffect(() => {
    const loadSession = async () => {
      try {
        const data = await apiFetch("/api/sessions");
        const session = (data.sessions || []).find((s) => s.id === Number(id));
        setSessionInfo(session || null);
        if (session?.mood) setCurrentMood(session.mood);
        // Load assistant avatar + model name + name
        if (session?.assistant_id) {
          try {
            const a = await apiFetch(`/api/assistants/${session.assistant_id}`);
            setAssistantName(a.name || "");
            if (a.avatar_url) {
              const url = await loadImageUrl(a.avatar_url);
              if (url) setAssistantAvatar(url);
            }
            if (a.model_preset_id) {
              try {
                const presetsData = await apiFetch("/api/presets");
                const preset = (presetsData.presets || []).find((p) => p.id === a.model_preset_id);
                if (preset) setModelName(preset.model_name);
              } catch {}
            }
          } catch {}
        }
      } catch {}
      // Load user avatar from IndexedDB (independent of session loading)
      try {
        const uUrl = await loadImageUrl("user-avatar");
        if (uUrl) setUserAvatar(uUrl);
      } catch {}
      setPageReady(true);
    };
    loadSession();
  }, [id]);

  // Load messages
  const loadMessages = useCallback(async (before = null) => {
    if (loadingRef.current) return;

    const el = messagesContainerRef.current;

    try {
      loadingRef.current = true;
      setLoading(true);

      let url = `/api/sessions/${id}/messages?limit=50`;
      if (before) url += `&before_id=${before}`;

      const data = await apiFetch(url);
      const msgs = (data.messages || []).filter(
        (m) => m.role === "user" || m.role === "assistant"
      );

      // Use backend's has_more flag
      const backendHasMore = data.has_more === true;
      setHasMore(backendHasMore);
      hasMoreRef.current = backendHasMore;

      if (msgs.length > 0) {
        const newCursor = msgs[0].id;
        setCursor(newCursor);
        cursorRef.current = newCursor;
      }

      if (before) {
        // Loading more - save position for restoration in useEffect
        const savedScrollHeight = el?.scrollHeight || 0;
        const savedScrollTop = el?.scrollTop || 0;

        // Save scroll restore info
        scrollRestoreRef.current = {
          savedScrollHeight,
          savedScrollTop,
        };

        setMessages((prev) => [...msgs, ...prev]);
      } else {
        // Initial load - scroll flag already set in useEffect
        setMessages(msgs);

        // Also try to scroll immediately after a short delay as fallback
        setTimeout(() => {
          const container = messagesContainerRef.current;
          if (container && shouldScrollToBottomRef.current) {
            container.scrollTop = container.scrollHeight;
          }
        }, 100);
      }
    } catch (e) {
      console.error("Failed to load messages", e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Reset states when session changes
    setHasMore(true);
    hasMoreRef.current = true;
    setCursor(null);
    cursorRef.current = null;
    setMessages([]);

    // Mark to scroll to bottom after loading
    shouldScrollToBottomRef.current = true;

    loadMessages();
    try {
      const map = JSON.parse(localStorage.getItem("session-read-times") || "{}");
      map[id] = Date.now();
      localStorage.setItem("session-read-times", JSON.stringify(map));
    } catch {}
  }, [id, loadMessages]);

  // Helper to scroll to bottom
  const scrollToBottomAuto = () => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  };

  // Helper to update read time
  const updateReadTime = () => {
    try {
      const map = JSON.parse(localStorage.getItem("session-read-times") || "{}");
      map[id] = Date.now();
      localStorage.setItem("session-read-times", JSON.stringify(map));
    } catch {}
  };

  // Restore scroll position after loading more messages OR scroll to bottom on initial load
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    if (scrollRestoreRef.current) {
      // Restore scroll position after loading more
      const { savedScrollHeight, savedScrollTop } = scrollRestoreRef.current;

      // Use multiple RAF to ensure rendering is complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newScrollTop = savedScrollTop + (el.scrollHeight - savedScrollHeight);
          el.scrollTop = newScrollTop;

          // Force repaint by reading layout properties
          void el.offsetHeight;

          // Micro-adjust to trigger render
          requestAnimationFrame(() => {
            el.scrollTop = newScrollTop + 1;
            requestAnimationFrame(() => {
              el.scrollTop = newScrollTop;
            });
          });
        });
      });

      // Clear the restore flag
      scrollRestoreRef.current = null;
    } else if (shouldScrollToBottomRef.current && messages.length > 0) {
      // Scroll to bottom on initial load (only if there are messages)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
          // Force repaint
          void el.offsetHeight;
        });
      });

      // Clear the flag
      shouldScrollToBottomRef.current = false;
    }
  }, [messages]);

  // Scroll handler: load more + show/hide scroll-to-bottom
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;

    // Show scroll to bottom button while scrolling (if not at bottom)
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (!nearBottom) {
      setShowScrollBtn(true);

      // Clear existing timer
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }

      // Hide button after scrolling stops (1 second)
      scrollTimerRef.current = setTimeout(() => {
        setShowScrollBtn(false);
      }, 1000);
    } else {
      // At bottom - hide button immediately
      setShowScrollBtn(false);
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    }

    // Load more when scrolled to top
    if (!hasMoreRef.current || loadingRef.current) return;
    if (el.scrollTop < 50 && cursorRef.current) {
      loadMessages(cursorRef.current);
    }
  };

  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
    const container = messagesContainerRef.current;
    if (el && container) {
      const offset = el.offsetTop - container.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
      container.scrollTo({ top: offset, behavior: "smooth" });
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

    // Build content with quote if present
    let content = text || (attachments.length > 0 ? "[附件]" : "");
    if (quotedMessage) {
      content = `[引用 ${quotedMessage.senderName} 的消息：${quotedMessage.content}]\n${content}`;
    }

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
    setQuotedMessage(null); // Clear quote after sending
    setTimeout(() => scrollToBottomAuto(), 50);

    setStreaming(true);
    streamContentRef.current = "";
    const aiMsgId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);
    setTimeout(() => scrollToBottomAuto(), 50);

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
          // Update read time when assistant message is received
          updateReadTime();
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

  // Normal mode "收" — ask AI to proactively send a message
  const receiveNormal = async () => {
    if (streaming || loading) return;
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
        { session_id: Number(id), message: "", stream: true },
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
          // Update read time when assistant message is received
          updateReadTime();
        }
      );
    } catch (e) {
      console.error("Receive failed", e);
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

  // Long-press menu handlers
  const startLongPress = (e, msg) => {
    const touch = e.touches ? e.touches[0] : e;
    longPressPos.current = { x: touch.clientX, y: touch.clientY };

    longPressTimer.current = setTimeout(() => {
      const menuWidth = 210;
      const menuHeight = 40;
      let x = longPressPos.current.x - menuWidth / 2;
      let y = longPressPos.current.y - menuHeight - 10;

      if (x + menuWidth > window.innerWidth - 10) {
        x = window.innerWidth - menuWidth - 10;
      }
      if (x < 10) x = 10;
      if (y < 10) {
        y = longPressPos.current.y + 10;
      }
      if (y + menuHeight > window.innerHeight - 10) {
        y = window.innerHeight - menuHeight - 10;
      }

      setContextMenu({ x, y, message: msg });
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Context menu actions
  const handleQuote = (msg) => {
    const senderName = msg.role === "user" ? "我" : assistantName || "AI";
    setQuotedMessage({ ...msg, senderName });
    closeContextMenu();
  };

  const handleCopy = async (msg) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg.content);
      } else {
        // Fallback for browsers without clipboard API
        const textArea = document.createElement("textarea");
        textArea.value = msg.content;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand("copy");
        } finally {
          document.body.removeChild(textArea);
        }
      }
      closeContextMenu();
    } catch (e) {
      console.error("Copy failed", e);
      closeContextMenu();
    }
  };

  const handleEdit = (msg) => {
    setEditingMessage(msg);
    setEditContent(msg.content);
    closeContextMenu();
  };

  const confirmEdit = async () => {
    if (!editingMessage || !editContent.trim()) return;
    try {
      await apiFetch(`/api/sessions/${id}/messages/${editingMessage.id}`, {
        method: "PUT",
        body: { content: editContent.trim() },
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingMessage.id ? { ...m, content: editContent.trim() } : m
        )
      );
    } catch (e) {
      console.error("Edit failed", e);
    }
    setEditingMessage(null);
    setEditContent("");
  };

  const handleDelete = (msg) => {
    setDeletingMessage(msg);
    closeContextMenu();
  };

  const confirmDelete = async () => {
    if (!deletingMessage) return;
    try {
      await apiFetch(`/api/sessions/${id}/messages/${deletingMessage.id}`, {
        method: "DELETE",
      });
      setMessages((prev) => prev.filter((m) => m.id !== deletingMessage.id));
    } catch (e) {
      console.error("Delete failed", e);
    }
    setDeletingMessage(null);
  };

  const handleReReply = async (msg) => {
    if (!msg || msg.role !== "assistant") return;
    closeContextMenu();

    // Delete current assistant message locally
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));

    // Delete from backend
    try {
      await apiFetch(`/api/sessions/${id}/messages/${msg.id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("Delete failed during re-reply", e);
    }

    // Request new AI reply with previous context
    setStreaming(true);
    streamContentRef.current = "";
    const aiMsgId = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);

    try {
      await apiSSE(
        "/api/chat/completions",
        { session_id: Number(id), message: "", stream: true },
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
          // Update read time when assistant message is received
          updateReadTime();
        }
      );
    } catch (e) {
      console.error("Re-reply failed", e);
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
    if (loading) return;
    setLoading(true);
    try {
      const body = { session_id: Number(id), stream: false };
      if (pendingMessages.length > 0) {
        body.messages = pendingMessages;
      } else {
        body.message = "";
      }
      const data = await apiFetch("/api/chat/completions", {
        method: "POST",
        body,
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
        // Update read time when assistant messages are received
        updateReadTime();
      }
    } catch (e) {
      console.error("Collect send failed", e);
    }
    setLoading(false);
  };

  const formatMsgTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    if (diffMs > 24 * 60 * 60 * 1000) {
      const month = d.getMonth() + 1;
      const day = d.getDate();
      return `${month}月${day}日 ${time}`;
    }
    return time;
  };

  const moodIcon = currentMood || "calm";
  const isGroup = !!(sessionInfo?.assistant_ids && sessionInfo.assistant_ids.length > 1);

  // Prevent flash: show background-matching placeholder until data loaded
  if (!pageReady) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: "var(--chat-bg)" }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "var(--chat-accent)", borderTopColor: "var(--chat-accent-dark)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--chat-bg)" }}>
      {/* Header */}
      <div
        className="px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-1"
        style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(228,160,184,0.2)" }}
      >
        {/* Top row: back / mood / title / mode / search — all vertically centered */}
        <div className="flex items-center">
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
            {sessionInfo?.title || assistantName || `会话 ${id}`}
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
        {/* Model name row — always rendered for consistent height */}
        <div className="text-center text-[11px] truncate -mt-0.5" style={{ color: "#c4a0b0", height: 14, lineHeight: "14px" }}>
          {!isGroup && modelName ? modelName : "\u00A0"}
        </div>
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
        className="flex-1 overflow-y-auto px-4 pt-6 pb-3 relative"
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
        onScroll={handleScroll}
      >
        {hasMore && messages.length > 0 && (
          <div className="text-center py-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2" style={{ borderColor: "var(--chat-accent)", borderTopColor: "transparent" }} />
                <span className="text-xs" style={{ color: "var(--chat-text-muted)" }}>加载中...</span>
              </div>
            ) : (
              <button
                onClick={() => cursorRef.current && loadMessages(cursorRef.current)}
                className="text-xs"
                style={{ color: "var(--chat-text-muted)" }}
              >
                加载更多
              </button>
            )}
          </div>
        )}
        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id || i} id={`msg-${msg.id}`} className="mb-3">
              <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-bubble`}>
                {/* AI avatar */}
                {!isUser && (
                  <div className="mr-2 shrink-0 mt-0.5 flex items-center justify-center overflow-hidden"
                    style={{
                      width: 46, height: 46, borderRadius: 14,
                      background: "linear-gradient(135deg, #ffd1e8, #e8d1ff)",
                      border: "2px solid #ffb8d9",
                    }}
                  >
                    {assistantAvatar ? (
                      <img src={assistantAvatar} alt="AI" className="h-full w-full object-cover" />
                    ) : (
                      <span style={{ fontSize: 14, color: "#7a5080", fontWeight: 600 }}>AI</span>
                    )}
                  </div>
                )}
                {/* Bubble + timestamp column */}
                <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginTop: 6 }}>
                  {/* Bubble */}
                  <div
                    onTouchStart={(e) => startLongPress(e, msg)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onMouseDown={(e) => startLongPress(e, msg)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onContextMenu={(e) => e.preventDefault()}
                    style={isUser ? {
                      padding: "10px 14px", borderRadius: "16px 4px 16px 16px",
                      background: "linear-gradient(135deg, #ffe0eb, #ffd1e8)",
                      border: "2px solid #ffb8d9", boxShadow: "2px 2px 0px #ffb8d9",
                      fontSize: 14, lineHeight: 1.6, color: "#4a3548",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                    } : {
                      padding: "10px 14px", borderRadius: "4px 16px 16px 16px",
                      background: "#ffffff",
                      border: "2px solid #e8d1ff", boxShadow: "2px 2px 0px #e0d0f0",
                      fontSize: 14, lineHeight: 1.6, color: "#4a3548",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                    }}
                  >
                    {/* Attachment images */}
                    {msg.attachments?.map((att, ai) => (
                      att.type === "image" || att.type === "sticker" ? (
                        <img key={ai} src={att.url} alt="" className="max-w-full rounded-lg mb-1" style={{ maxHeight: 200 }} />
                      ) : att.type === "file" ? (
                        <div key={ai} className="flex items-center gap-2 rounded-lg px-2 py-1 mb-1 text-xs" style={{ background: "rgba(0,0,0,0.08)" }}>
                          <File size={14} /> {att.name}
                        </div>
                      ) : null
                    ))}
                    {msg.content || (streaming && !isUser ? "..." : "")}
                  </div>
                  {/* Timestamp below bubble */}
                  {msg.created_at && (
                    <span style={{
                      fontSize: 10, color: "#c4a0b0", marginTop: 3,
                      paddingLeft: isUser ? 0 : 6,
                      paddingRight: isUser ? 6 : 0,
                      userSelect: "none",
                      WebkitUserSelect: "none",
                    }}>
                      {formatMsgTime(msg.created_at)}
                    </span>
                  )}
                </div>
                {/* User avatar */}
                {isUser && (
                  <div className="ml-2 shrink-0 mt-0.5 flex items-center justify-center overflow-hidden"
                    style={{
                      width: 46, height: 46, borderRadius: 14,
                      background: "linear-gradient(135deg, #fff0d0, #ffe0eb)",
                      border: "2px solid #ffc8a0",
                    }}
                  >
                    {userAvatar ? (
                      <img src={userAvatar} alt="me" className="h-full w-full object-cover" />
                    ) : (
                      <span style={{ fontSize: 14, color: "#8a6040", fontWeight: 600 }}>我</span>
                    )}
                  </div>
                )}
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
        ref={inputAreaRef}
        className="px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
        style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(228,160,184,0.2)" }}
      >
        {/* Quote preview */}
        {quotedMessage && (
          <div className="mb-2 rounded-xl p-3 relative" style={{ background: "var(--chat-input-bg)", border: "1px solid var(--chat-accent)" }}>
            <button
              onClick={() => setQuotedMessage(null)}
              className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-white text-xs"
              style={{ background: "var(--chat-accent-dark)" }}
            >
              ×
            </button>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--chat-accent-dark)" }}>
              引用 {quotedMessage.senderName} 的消息
            </div>
            <div className="text-sm truncate" style={{ color: "var(--chat-text)", opacity: 0.7 }}>
              {quotedMessage.content}
            </div>
          </div>
        )}

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

          {/* Action buttons — both modes have 收 + 发送 */}
          {mode === "normal" ? (
            <>
              <button
                onClick={receiveNormal}
                disabled={streaming || loading}
                className="mb-1 flex h-9 items-center justify-center rounded-full px-3 text-xs text-white disabled:opacity-30 active:scale-90 transition"
                style={{ background: "var(--chat-accent)" }}
              >
                <Inbox size={14} className="mr-1" />
                {loading ? "..." : "收"}
              </button>
              <button
                onClick={streaming ? stopStream : sendNormal}
                disabled={!streaming && !input.trim() && attachments.length === 0}
                className="mb-1 flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-30 active:scale-90 transition"
                style={{ background: "var(--chat-accent-dark)" }}
              >
                {streaming ? <Square size={14} fill="white" /> : <Send size={14} />}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={collectAndSend}
                disabled={loading}
                className="mb-1 flex h-9 items-center justify-center rounded-full px-3 text-xs text-white disabled:opacity-30 active:scale-90 transition"
                style={{ background: "var(--chat-accent)" }}
              >
                <Inbox size={14} className="mr-1" />
                {loading ? "..." : "收"}
              </button>
              <button
                onClick={sendShort}
                disabled={!input.trim()}
                className="mb-1 flex h-9 items-center justify-center rounded-full px-3 text-xs text-white disabled:opacity-30 active:scale-90 transition"
                style={{ background: "var(--chat-accent-dark)" }}
              >
                发送
              </button>
            </>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={closeContextMenu}
          />
          <div
            className="fixed z-[101] rounded-full shadow-2xl animate-slide-in flex"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              background: "var(--chat-card-bg)",
              border: "1px solid var(--chat-accent)",
            }}
          >
            <button
              onClick={() => handleQuote(contextMenu.message)}
              className="py-2 text-xs hover:bg-black/5 active:bg-black/10 rounded-l-full"
              style={{ color: "var(--chat-text)", width: "52px" }}
            >
              引用
            </button>
            <div style={{ width: "1px", background: "var(--chat-accent)", opacity: 0.3 }} />
            <button
              onClick={() => handleCopy(contextMenu.message)}
              className="py-2 text-xs hover:bg-black/5 active:bg-black/10"
              style={{ color: "var(--chat-text)", width: "52px" }}
            >
              复制
            </button>
            <div style={{ width: "1px", background: "var(--chat-accent)", opacity: 0.3 }} />
            {contextMenu.message.role === "user" ? (
              <>
                <button
                  onClick={() => handleEdit(contextMenu.message)}
                  className="py-2 text-xs hover:bg-black/5 active:bg-black/10"
                  style={{ color: "var(--chat-text)", width: "52px" }}
                >
                  编辑
                </button>
                <div style={{ width: "1px", background: "var(--chat-accent)", opacity: 0.3 }} />
              </>
            ) : (
              <>
                <button
                  onClick={() => handleReReply(contextMenu.message)}
                  className="py-2 text-xs hover:bg-black/5 active:bg-black/10"
                  style={{ color: "var(--chat-text)", width: "52px" }}
                >
                  重回
                </button>
                <div style={{ width: "1px", background: "var(--chat-accent)", opacity: 0.3 }} />
              </>
            )}
            <button
              onClick={() => handleDelete(contextMenu.message)}
              className="py-2 text-xs hover:bg-black/5 active:bg-black/10 text-red-500 rounded-r-full"
              style={{ width: "52px" }}
            >
              删除
            </button>
          </div>
        </>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={editingMessage !== null}
        onClose={() => { setEditingMessage(null); setEditContent(""); }}
        title="编辑消息"
        onConfirm={confirmEdit}
        confirmText="确认"
        cancelText="取消"
        isConfirmDisabled={!editContent.trim()}
      >
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          placeholder="输入消息内容"
          className="w-full rounded-xl px-4 py-3 text-base outline-none resize-none min-h-24"
          style={{
            background: "var(--chat-input-bg)",
            border: "1px solid var(--chat-accent)",
            color: "var(--chat-text)",
          }}
          autoFocus
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deletingMessage !== null}
        onClose={() => setDeletingMessage(null)}
        onConfirm={confirmDelete}
        title="删除消息"
        message="确定要删除这条消息吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
      />
    </div>
  );
}
