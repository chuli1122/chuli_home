import { Fragment, useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronDown, X,
  File as FileIcon, Plus,
  Quote, Copy, Pencil, RotateCcw, Trash2,
} from "lucide-react";
import { apiFetch, apiSSE } from "../../utils/api";
import { loadImageUrl, getAllStickers, addSticker, removeSticker, saveImage, getImage, blobToBase64 } from "../../utils/db";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import MessageContent from "./MessageContent";

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

const isEmptyAssistant = (m) =>
  m.role === "assistant" && (!m.content || !m.content.trim() || m.content.trim() === "EMPTY");

// Split assistant messages containing [NEXT] into separate entries
const splitNextMessages = (msgs) => {
  const result = [];
  for (const m of msgs) {
    if (m.role === "assistant" && m.content && m.content.includes("[NEXT]")) {
      m.content.split("[NEXT]").filter((p) => p.trim()).forEach((part, idx) => {
        result.push({
          ...m,
          id: idx === 0 ? m.id : m.id + 0.001 * idx,
          content: part.replace(/\[\[used:\d+\]\]/g, "").trim(),
        });
      });
    } else {
      result.push(m);
    }
  }
  return result;
};

export default function ChatSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(`chat-mode-${id}`) || "normal"; } catch { return "normal"; }
  });
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
  const streamAutoScrollRef = useRef(true);

  // Mood
  const [currentMood, setCurrentMood] = useState(null);
  const [showMoodPicker, setShowMoodPicker] = useState(false);

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const searchInputRef = useRef(null);
  const [pawIndicator, setPawIndicator] = useState(null); // { msgId } for cat paw bounce

  // Toolbar & panels
  const [showToolbar, setShowToolbar] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [stickerUrls, setStickerUrls] = useState({});
  const [deletingSticker, setDeletingSticker] = useState(null); // key of sticker showing delete bubble
  const [stickerDeleteConfirm, setStickerDeleteConfirm] = useState(false); // whether in confirm state

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const attachmentInputRef = useRef(null);
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
        // Load mood from latest summary
        try {
          const sumData = await apiFetch(`/api/sessions/${id}/summaries`);
          const latest = (sumData.summaries || [])[0];
          if (latest?.mood_tag) setCurrentMood(latest.mood_tag);
        } catch {}
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

  // Reset delete state when sticker panel closes
  useEffect(() => {
    if (!showStickerPanel) {
      setDeletingSticker(null);
      setStickerDeleteConfirm(false);
    }
  }, [showStickerPanel]);

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
      const msgs = splitNextMessages((data.messages || []).filter(
        (m) => m.role === "user" || m.role === "assistant" || m.role === "system"
      ));

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
        // Initial load — useEffect will handle persistent scroll via shouldScrollToBottomRef
        setMessages(msgs);
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
      // Persistent scroll: keep forcing bottom for 1.5s to handle late-rendering content
      shouldScrollToBottomRef.current = false;
      const startTime = Date.now();
      const persistScroll = () => {
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        if (Date.now() - startTime < 1500) {
          requestAnimationFrame(persistScroll);
        }
      };
      requestAnimationFrame(persistScroll);
    }
  }, [messages, pageReady]);

  // visualViewport keyboard detection for search panel
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      setKeyboardHeight(Math.max(0, window.innerHeight - vv.height));
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Delayed focus for search input (avoid iOS viewport push)
  useEffect(() => {
    if (showSearch) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 350);
      return () => clearTimeout(timer);
    }
  }, [showSearch]);

  // Load all messages when search opens; auto-search with debounce on query change
  useEffect(() => {
    if (!showSearch) return;
    if (!searchQuery.trim()) {
      // Default: load all messages reverse chronologically
      (async () => {
        setSearching(true);
        try {
          const data = await apiFetch(`/api/sessions/${id}/messages?limit=200`);
          const all = (data.messages || []).filter(
            (m) => (m.role === "user" || m.role === "assistant") && !isEmptyAssistant(m)
          );
          setSearchResults(all.reverse());
        } catch { setSearchResults([]); }
        setSearching(false);
      })();
      return;
    }
    const timer = setTimeout(() => {
      doSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, showSearch]);

  // Scroll handler: load more + show/hide scroll-to-bottom + streaming sticky scroll
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    // During streaming: track whether user scrolled away from bottom
    if (streaming) {
      streamAutoScrollRef.current = nearBottom;
    }

    if (!nearBottom) {
      setShowScrollBtn(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setShowScrollBtn(false), 1000);
    } else {
      setShowScrollBtn(false);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
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
    try { localStorage.setItem(`chat-mode-${id}`, next); } catch {}
    setModeTip(next === "short" ? "已切换到短消息模式" : "已切换到普通模式");
    setTimeout(() => setModeTip(""), 2000);
  };

  // Mood — persist to latest summary's mood_tag
  const selectMood = async (key) => {
    setCurrentMood(key);
    setShowMoodPicker(false);
    try {
      const res = await apiFetch(`/api/sessions/${id}/mood`, {
        method: "PUT",
        body: { mood_tag: key },
      });
      if (res.system_message) {
        setMessages((prev) => [...prev, res.system_message]);
        setTimeout(() => scrollToBottomAuto(), 50);
      }
    } catch {}
  };

  // Search
  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch(`/api/sessions/${id}/messages?limit=200&search=${encodeURIComponent(searchQuery.trim())}`);
      const all = (data.messages || []).filter(
        (m) => (m.role === "user" || m.role === "assistant" || m.role === "system") && !isEmptyAssistant(m)
      );
      setSearchResults(all.reverse()); // newest first
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  // Highlight keyword in search result text
  const highlightText = (text, keyword) => {
    if (!keyword) return text;
    const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ color: "var(--chat-accent-dark)", fontWeight: 600 }}>{text.slice(idx, idx + keyword.length)}</span>
        {text.slice(idx + keyword.length)}
      </>
    );
  };

  const closeSearch = () => {
    searchInputRef.current?.blur();
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const jumpToMessage = async (msgId) => {
    closeSearch();

    const tryScroll = () => {
      const el = document.getElementById(`msg-${msgId}`);
      const container = messagesContainerRef.current;
      if (el && container) {
        const offset = el.offsetTop - container.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
        container.scrollTo({ top: offset, behavior: "smooth" });
        // Show cat paw indicator
        setPawIndicator({ msgId });
        setTimeout(() => setPawIndicator(null), 2000);
        return true;
      }
      return false;
    };

    if (tryScroll()) return;

    // Message not loaded — load messages around the target
    try {
      const data = await apiFetch(`/api/sessions/${id}/messages?limit=50&before_id=${msgId + 1}`);
      const msgs = splitNextMessages((data.messages || []).filter(
        (m) => m.role === "user" || m.role === "assistant" || m.role === "system"
      ));
      if (msgs.length > 0) {
        setHasMore(data.has_more === true);
        hasMoreRef.current = data.has_more === true;
        const newCursor = msgs[0].id;
        setCursor(newCursor);
        cursorRef.current = newCursor;
        setMessages(msgs);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            tryScroll();
          });
        });
      }
    } catch (e) {
      console.error("Failed to load messages around target", e);
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
      setAttachments((prev) => [...prev, { type: "sticker", key: stickerKey, url, imageId: stickerKey }]);
    }
    setShowStickerPanel(false);
  };

  const handleRemoveSticker = async (stickerKey) => {
    await removeSticker(stickerKey);
    loadStickers();
  };

  // Attachments
  const handleAttachmentSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const imageId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await saveImage(imageId, file);
      const url = URL.createObjectURL(file);
      setAttachments((prev) => [...prev, { type: "image", file, url, name: file.name, imageId }]);
    } else {
      const textExts = /\.(txt|md|json|js|jsx|ts|tsx|py|java|c|cpp|h|css|html|xml|yaml|yml|toml|ini|cfg|sh|bat|sql|csv|log|rst|rb|go|rs|swift|kt|scala|r|m|mm|pl|php|lua|zig|asm|s)$/i;
      if (textExts.test(file.name)) {
        const text = await file.text();
        setAttachments((prev) => [...prev, { type: "text-file", content: text, name: file.name }]);
      } else {
        const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await saveImage(fileId, file);
        const url = URL.createObjectURL(file);
        setAttachments((prev) => [...prev, { type: "binary-file", file, url, name: file.name, fileId }]);
      }
    }
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
    let textContent = text;
    if (quotedMessage) {
      textContent = `[引用 ${quotedMessage.senderName} 的消息：${quotedMessage.content}]\n${textContent}`;
    }

    // Prepend text-file contents
    for (const att of attachments) {
      if (att.type === "text-file") {
        textContent = `[文件: ${att.name}]\n${att.content}\n[/文件]\n${textContent}`;
      }
    }

    // Check if we have image/binary-file attachments needing multimodal
    const multimodalAtts = attachments.filter(
      (a) => a.type === "image" || a.type === "sticker" || a.type === "binary-file"
    );

    let messageToSend;
    let displayContent = textContent;

    if (multimodalAtts.length > 0) {
      const parts = [];
      const markers = [];
      for (const att of multimodalAtts) {
        if (att.type === "image" || att.type === "sticker") {
          const record = await getImage(att.imageId);
          if (record?.blob) {
            const base64 = await blobToBase64(record.blob);
            parts.push({ type: "image_url", image_url: { url: base64 }, image_id: att.imageId });
            markers.push(`[图片:${att.imageId}]`);
          }
        } else if (att.type === "binary-file") {
          const record = await getImage(att.fileId);
          if (record?.blob) {
            const base64 = await blobToBase64(record.blob);
            parts.push({ type: "file", file_url: { url: base64 }, file_id: att.fileId, file_name: att.name });
            markers.push(`[文件:${att.fileId}:${att.name}]`);
          }
        }
      }
      parts.push({ type: "text", text: textContent });
      messageToSend = parts;
      displayContent = markers.join("") + textContent;
    } else {
      messageToSend = textContent;
      displayContent = textContent;
    }

    const userMsg = {
      id: Date.now(),
      role: "user",
      content: displayContent || "[附件]",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setAttachments([]);
    setQuotedMessage(null);
    setTimeout(() => scrollToBottomAuto(), 50);

    setStreaming(true);
    streamAutoScrollRef.current = true;
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
        { session_id: Number(id), message: messageToSend, stream: true },
        (chunk) => {
          if (chunk.content) {
            streamContentRef.current += chunk.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: streamContentRef.current } : m
              )
            );
            if (streamAutoScrollRef.current) scrollToBottomAuto();
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
    streamAutoScrollRef.current = true;
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
        { session_id: Number(id), message: "", stream: true },
        (chunk) => {
          if (chunk.content) {
            streamContentRef.current += chunk.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: streamContentRef.current } : m
              )
            );
            if (streamAutoScrollRef.current) scrollToBottomAuto();
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
      const itemCount = msg.role === "system" ? 1 : 4;
      const menuWidth = itemCount * 42 + (itemCount - 1) + 8; // 42px per item + 1px separators + padding
      const menuHeight = 48;
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

  const handleDelete = async (msg) => {
    closeContextMenu();
    // System messages: delete directly without confirmation
    if (msg.role === "system") {
      try {
        await apiFetch(`/api/sessions/${id}/messages/${msg.id}`, { method: "DELETE" });
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      } catch (e) {
        console.error("Delete failed", e);
      }
      return;
    }
    setDeletingMessage(msg);
  };

  const confirmDelete = async () => {
    if (!deletingMessage) return;
    try {
      await apiFetch(`/api/sessions/${id}/messages/${deletingMessage.id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("Delete failed", e);
    }
    // Always remove locally (temp IDs may not exist in DB)
    setMessages((prev) => prev.filter((m) => m.id !== deletingMessage.id));
    setDeletingMessage(null);
  };

  const handleReReply = async (msg) => {
    if (!msg || msg.role !== "assistant") return;
    closeContextMenu();

    // Find the user message right before this assistant message
    const currentMessages = [...messages];
    const aiIdx = currentMessages.findIndex((m) => m.id === msg.id);
    let prevUserMsg = null;
    if (aiIdx > 0) {
      for (let j = aiIdx - 1; j >= 0; j--) {
        if (currentMessages[j].role === "user") {
          prevUserMsg = currentMessages[j];
          break;
        }
      }
    }

    // Delete current assistant message locally
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));

    // Delete from backend
    try {
      await apiFetch(`/api/sessions/${id}/messages/${msg.id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Delete failed during re-reply", e);
    }

    // Try to rebuild multimodal content from the previous user message's markers
    let messageToSend = "";
    if (prevUserMsg?.content) {
      const imgMarkers = [...prevUserMsg.content.matchAll(/\[图片:([^\]]+)\]/g)];
      const fileMarkers = [...prevUserMsg.content.matchAll(/\[文件:([^:]+):([^\]]+)\]/g)];

      if (imgMarkers.length > 0 || fileMarkers.length > 0) {
        const parts = [];
        // Load images from IndexedDB
        for (const m of imgMarkers) {
          const record = await getImage(m[1]);
          if (record?.blob) {
            const base64 = await blobToBase64(record.blob);
            parts.push({ type: "image_url", image_url: { url: base64 }, image_id: m[1] });
          }
        }
        // Load binary files from IndexedDB
        for (const m of fileMarkers) {
          const record = await getImage(m[1]);
          if (record?.blob) {
            const base64 = await blobToBase64(record.blob);
            parts.push({ type: "file", file_url: { url: base64 }, file_id: m[1], file_name: m[2] });
          }
        }
        if (parts.length > 0) {
          // Strip markers from text and add as text part
          const textOnly = prevUserMsg.content
            .replace(/\[图片:[^\]]+\]/g, "")
            .replace(/\[文件:[^:]+:[^\]]+\]/g, "")
            .trim();
          parts.push({ type: "text", text: textOnly });
          messageToSend = parts;

          // Delete the old user message from backend and resend with multimodal
          if (prevUserMsg.id) {
            try {
              await apiFetch(`/api/sessions/${id}/messages/${prevUserMsg.id}`, { method: "DELETE" });
            } catch (e) {
              console.error("Delete user msg failed during re-reply", e);
            }
          }
        }
      }
    }

    // Request new AI reply
    setStreaming(true);
    streamAutoScrollRef.current = true;
    streamContentRef.current = "";
    const aiMsgId = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);
    setTimeout(() => scrollToBottomAuto(), 50);

    try {
      await apiSSE(
        "/api/chat/completions",
        { session_id: Number(id), message: messageToSend, stream: true },
        (chunk) => {
          if (chunk.content) {
            streamContentRef.current += chunk.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: streamContentRef.current } : m
              )
            );
            if (streamAutoScrollRef.current) scrollToBottomAuto();
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
    setTimeout(() => scrollToBottomAuto(), 50);
  };

  const collectAndSend = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const msgsToSend = pendingMessages.length > 0 ? pendingMessages : [];
      const body = { session_id: Number(id), stream: false, messages: msgsToSend, short_mode: true };
      const data = await apiFetch("/api/chat/completions", {
        method: "POST",
        body,
      });
      setPendingMessages([]);
      const responseMessages = data.messages || [];
      // Collect ALL new assistant messages (no DB id, no tool_calls)
      let replies = responseMessages.filter(
        (m) => m.role === "assistant" && !m.id && m.content && !m.tool_calls
      );
      // Fallback: last assistant message that's not a repeat
      if (replies.length === 0) {
        const candidate = responseMessages
          .filter((m) => m.role === "assistant" && m.content)
          .pop();
        const localLast = messages.filter((m) => m.role === "assistant").pop();
        if (candidate && (!localLast || candidate.content !== localLast.content)) {
          replies = [candidate];
        }
      }
      // Display each reply with delay, also handle any remaining [NEXT] splits
      const allParts = [];
      for (const r of replies) {
        const parts = r.content.split("[NEXT]").filter(Boolean);
        for (const p of parts) {
          const clean = p.replace(/\[\[used:\d+\]\]/g, "").trim();
          if (clean) allParts.push(clean);
        }
      }
      for (let i = 0; i < allParts.length; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 0 : 1500));
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + i,
            role: "assistant",
            content: allParts[i],
            created_at: new Date().toISOString(),
          },
        ]);
        setTimeout(() => scrollToBottomAuto(), 50);
      }
      if (allParts.length > 0) updateReadTime();
    } catch (e) {
      console.error("Collect send failed", e);
    }
    setLoading(false);
  };

  const formatMsgTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  };

  // Get date string (YYYY.MM.DD) for a timestamp, used for date dividers
  const getMsgDateStr = (ts) => {
    if (!ts) return null;
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
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
    <div className="flex flex-col h-full chat-polkadot-bg">
      {/* Header */}
      <div
        className="pt-[calc(0.5rem+env(safe-area-inset-top))] pb-1"
        style={{ background: "rgba(255,248,255,0.7)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(200,160,224,0.25)" }}
      >
        <div className="flex items-center">
          {/* Back — only this moves when marginLeft changes */}
          <button
            onClick={() => navigate("/chat/messages", { replace: true })}
            className="p-1 shrink-0 active:scale-90 transition"
            style={{ marginLeft: 20 }}
          >
            <img src="/assets/decorations/爱心.png" alt="返回" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
          </button>

          <div className="w-2" />

          {/* Mood — stays fixed next to frame */}
          <button
            onClick={() => setShowMoodPicker(!showMoodPicker)}
            className="h-8 w-8 shrink-0 rounded-full overflow-hidden active:scale-90 transition"
          >
            <img src={`/assets/mood/${moodIcon}.png`} alt={moodIcon} className="h-full w-full object-contain" />
          </button>

          {/* Center: title frame */}
          <div className="title-frame flex-1 text-center min-w-0 relative mx-1.5" style={{ padding: "5px 32px" }}>
            <img
              src="/assets/decorations/星星-闪亮.png"
              alt=""
              className="absolute animate-float-bounce pixel-icon"
              style={{ width: 22, height: 22, top: -12, right: 2, opacity: 0.6 }}
            />
            <h1
              className="font-semibold truncate"
              style={{ color: "#4a2050", fontSize: 15, lineHeight: "20px" }}
            >
              {loading && mode === "short" ? "对方正在输入..." : (sessionInfo?.title || assistantName || `会话 ${id}`)}
            </h1>
            <div className="truncate" style={{ color: "#c4a0b0", fontSize: 8, lineHeight: "11px" }}>
              {!isGroup && modelName ? modelName : "\u00A0"}
            </div>
          </div>

          {/* Mode toggle — stays fixed next to frame */}
          <button
            onClick={toggleMode}
            className="p-1 shrink-0 active:scale-90 transition"
            title={mode === "normal" ? "切换到短消息" : "切换到普通模式"}
          >
            <img
              src="/assets/decorations/星星粉白.png"
              alt="切换"
              style={{
                width: 28, height: 28, imageRendering: "pixelated",
                opacity: mode === "short" ? 1 : 0.45,
              }}
            />
          </button>

          <div className="w-1" />

          {/* Search — only this moves when marginRight changes */}
          <button
            onClick={() => setShowSearch(true)}
            className="p-1 shrink-0 active:scale-90 transition"
            style={{ marginRight: 20 }}
          >
            <img src="/assets/decorations/星星.png" alt="搜索" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
          </button>
        </div>
      </div>

      {/* Mood Picker */}
      {showMoodPicker && (
        <div
          className="absolute z-50 animate-slide-in rounded-2xl overflow-hidden"
          style={{
            top: "calc(3.2rem + env(safe-area-inset-top))",
            left: "calc(50% - 110px)",
            width: 220,
            background: "rgba(255,245,250,0.35)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.1)",
            border: "1.5px solid #e8c0d8",
          }}
        >
          <div className="mood-grid">
            {MOODS.map((m) => (
              <button
                key={m.key}
                onClick={() => selectMood(m.key)}
                className="flex flex-col items-center gap-0.5 py-2 px-1 active:scale-90 transition"
                style={{
                  background: currentMood === m.key ? "rgba(232,160,184,0.15)" : "transparent",
                }}
              >
                <img
                  src={`/assets/mood/${m.key}.png`}
                  alt={m.label}
                  className="h-8 w-8 object-contain"
                />
                <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Panel — half-screen bottom sheet */}
      {showSearch && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 animate-fade-in"
            style={{ background: "rgba(0,0,0,0.2)" }}
            onClick={closeSearch}
          />
          {/* Panel */}
          <div
            className="fixed left-0 right-0 bottom-0 z-50 flex flex-col animate-slide-up"
            style={{
              height: "70%",
              borderRadius: "20px 20px 0 0",
              background: "var(--chat-bg)",
              boxShadow: "0 -4px 24px rgba(0,0,0,0.1)",
              paddingBottom: keyboardHeight,
              transition: "padding-bottom 0.15s ease-out",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--chat-accent)", opacity: 0.3 }} />
            </div>
            {/* Search input row */}
            <div className="flex items-center gap-2 px-4 pb-3">
              <div
                className="flex flex-1 items-center gap-2 rounded-full px-4 py-2.5"
                style={{ background: "var(--chat-card-bg)", border: "1px dashed var(--chat-accent)" }}
              >
                <img src="/assets/decorations/灯泡.png" alt="" style={{ width: 22, height: 22, imageRendering: "pixelated", opacity: 0.6 }} />
                <input
                  ref={searchInputRef}
                  type="search"
                  enterKeyHint="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }}
                  placeholder="搜索聊天记录..."
                  className="flex-1 text-sm outline-none bg-transparent"
                  style={{ color: "var(--chat-text)", WebkitAppearance: "none" }}
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="active:opacity-60">
                    <X size={14} style={{ color: "var(--chat-text-muted)" }} />
                  </button>
                )}
              </div>
              <button
                onClick={closeSearch}
                className="active:scale-90 transition shrink-0"
              >
                <img src="/assets/pixel/像素猫脸方块.png" alt="关闭" style={{ width: 46, height: 46, imageRendering: "pixelated" }} />
              </button>
            </div>
            {/* Results — card list */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-4">
              {searching && (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "var(--chat-accent)", borderTopColor: "var(--chat-accent-dark)" }} />
                </div>
              )}
              {!searching && searchResults.length > 0 && (
                <p className="text-[10px] pb-1.5" style={{ color: "var(--chat-text-muted)" }}>
                  {searchQuery.trim() ? `找到 ${searchResults.length} 条结果` : `共 ${searchResults.length} 条消息`}
                </p>
              )}
              {!searching && searchResults.map((r) => {
                const name = r.role === "user" ? "我" : (assistantName || "AI");
                return (
                  <button
                    key={r.id}
                    onClick={() => jumpToMessage(r.id)}
                    className="w-full text-left rounded-xl p-3 mb-2 active:scale-[0.98] transition-transform"
                    style={{
                      background: "var(--chat-input-bg)",
                      border: "1px solid var(--chat-accent)",
                    }}
                  >
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: r.role === "user" ? "var(--chat-accent-dark)" : "var(--chat-text)" }}>
                        {name}
                      </span>
                      <span className="text-[10px] shrink-0 ml-2" style={{ color: "var(--chat-text-muted)" }}>
                        {formatMsgTime(r.created_at)}
                      </span>
                    </div>
                    <p className="truncate text-sm" style={{ color: "var(--chat-text)", opacity: 0.7 }}>
                      {searchQuery.trim() ? highlightText(r.content, searchQuery.trim()) : r.content}
                    </p>
                  </button>
                );
              })}
              {!searching && searchResults.length === 0 && searchQuery && (
                <div className="flex flex-col items-center py-6 gap-1">
                  <img
                    src="/assets/decorations/MISS.png"
                    alt="MISS"
                    style={{ width: 100, height: "auto", imageRendering: "pixelated" }}
                  />
                  <p style={{ fontSize: 11, color: "var(--chat-text-muted)", marginTop: 4 }}>
                    糟糕，没有哦...
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Pixel background decorations */}
      <img
        src="/assets/pixel/像素星光散布.png"
        alt=""
        className="absolute pixel-icon"
        style={{ width: 40, height: 40, bottom: 80, right: 8, opacity: 0.12, zIndex: 0 }}
      />

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
          // Skip empty/EMPTY assistant messages (including empty tool-call intermediates)
          if (isEmptyAssistant(msg)) return null;
          // Date divider — show when date changes between visible messages
          const curDate = getMsgDateStr(msg.created_at);
          const prevDate = (() => {
            for (let j = i - 1; j >= 0; j--) {
              if (isEmptyAssistant(messages[j])) continue;
              return getMsgDateStr(messages[j].created_at);
            }
            return null;
          })();
          const showDateDivider = curDate && curDate !== prevDate;
          // System notification — centered inset style
          // Date divider element — same style as system mood tags
          const dateDividerEl = showDateDivider ? (
            <div className="my-3 flex justify-center">
              <span className="px-3 py-1 rounded-full" style={{
                fontSize: 10, color: "#b0a0b8",
                background: "rgba(0,0,0,0.03)",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)",
                border: "1px dashed rgba(176,160,184,0.4)",
                userSelect: "none", WebkitUserSelect: "none",
              }}>{curDate}</span>
            </div>
          ) : null;
          if (msg.role === "system") {
            // Friendly display for mood change messages
            let displayText = msg.content;
            const moodMatch = msg.content.match(/手动更改心情标签为:\s*(\w+)/);
            if (moodMatch) {
              displayText = `已更改心情为：${moodMatch[1]}`;
            }
            return (
              <Fragment key={msg.id || i}>
              {dateDividerEl}
              <div id={`msg-${msg.id}`} className="my-3 flex justify-center">
                <span
                  onTouchStart={(e) => startLongPress(e, msg)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onMouseDown={(e) => startLongPress(e, msg)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onContextMenu={(e) => e.preventDefault()}
                  className="px-3 py-1 rounded-full"
                  style={{
                    fontSize: 10, color: "#b0a0b8",
                    background: "rgba(0,0,0,0.03)",
                    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)",
                    border: "1px dashed rgba(176,160,184,0.4)",
                    userSelect: "none", WebkitUserSelect: "none",
                  }}
                >
                  {displayText}
                </span>
              </div>
              </Fragment>
            );
          }
          const isUser = msg.role === "user";
          const showPaw = pawIndicator && pawIndicator.msgId === msg.id;
          // Show avatar only on first message in a consecutive run from the same role
          const showAvatar = (() => {
            for (let j = i - 1; j >= 0; j--) {
              const prev = messages[j];
              if (isEmptyAssistant(prev) || prev.role === "system") continue;
              return prev.role !== msg.role;
            }
            return true;
          })();
          return (
            <Fragment key={msg.id || i}>
            {dateDividerEl}
            <div id={`msg-${msg.id}`} className={`${showAvatar ? "mt-5" : "mt-2"} relative animate-bubble`} style={{ paddingLeft: 4, paddingRight: 4 }}>
              {/* Avatar row — only when showAvatar */}
              {showAvatar && (
                <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}>
                  {!isUser && (
                    <div className="shrink-0 flex items-center justify-center overflow-hidden"
                      style={{
                        width: 42, height: 42, borderRadius: 13,
                        background: "linear-gradient(135deg, #ffd1e8, #e8d1ff)",
                        border: "2px solid #ffb8d9",
                      }}
                    >
                      {assistantAvatar ? (
                        <img src={assistantAvatar} alt="AI" className="h-full w-full object-cover" />
                      ) : (
                        <span style={{ fontSize: 13, color: "#7a5080", fontWeight: 600 }}>AI</span>
                      )}
                    </div>
                  )}
                  {isUser && (
                    <div className="shrink-0 flex items-center justify-center overflow-hidden"
                      style={{
                        width: 42, height: 42, borderRadius: 13,
                        background: "linear-gradient(135deg, #fff0d0, #ffe0eb)",
                        border: "2px solid #ffc8a0",
                      }}
                    >
                      {userAvatar ? (
                        <img src={userAvatar} alt="me" className="h-full w-full object-cover" />
                      ) : (
                        <span style={{ fontSize: 13, color: "#8a6040", fontWeight: 600 }}>我</span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Bubble row — flush to edge, timestamp on opposite side */}
              <div className={`flex items-end ${isUser ? "justify-end" : "justify-start"}`}>
                {/* Timestamp on left of user bubble */}
                {isUser && msg.created_at && (
                  <span className="shrink-0" style={{
                    fontSize: 10, color: "#c4a0b0", marginRight: 6, marginBottom: 2,
                    userSelect: "none", WebkitUserSelect: "none",
                  }}>
                    {formatMsgTime(msg.created_at)}
                  </span>
                )}
                {/* Bubble */}
                <div
                  onTouchStart={(e) => startLongPress(e, msg)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onMouseDown={(e) => startLongPress(e, msg)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{
                    maxWidth: "88%",
                    padding: "7px 14px",
                    borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                    background: isUser
                      ? "linear-gradient(135deg, #ffe8f0, #ffddea)"
                      : "linear-gradient(135deg, #fffef8, #fffaf0)",
                    border: isUser ? "2px solid #ffb8d9" : "2px solid #e8d1ff",
                    boxShadow: isUser ? "2px 2px 0px #ffb8d9" : "2px 2px 0px #e0d0f0",
                    fontSize: 14, lineHeight: 1.6, color: "#4a3548",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                  }}
                >
                  {msg.content ? (
                    <MessageContent
                      content={msg.content}
                      isMarkdown={!isUser}
                    />
                  ) : (
                    streaming && !isUser ? "..." : ""
                  )}
                </div>
                {/* Timestamp on right of AI bubble */}
                {!isUser && msg.created_at && (
                  <span className="shrink-0" style={{
                    fontSize: 10, color: "#c4a0b0", marginLeft: 6, marginBottom: 2,
                    userSelect: "none", WebkitUserSelect: "none",
                  }}>
                    {formatMsgTime(msg.created_at)}
                  </span>
                )}
              </div>
              {/* Cat paw locate indicator */}
              {showPaw && (
                <div
                  className="absolute animate-paw-bounce pointer-events-none"
                  style={{
                    top: -6,
                    [isUser ? "right" : "left"]: 56,
                  }}
                >
                  <img
                    src="/assets/decorations/两个小猫爪.png"
                    alt=""
                    style={{ width: 32, height: 32, imageRendering: "pixelated" }}
                  />
                </div>
              )}
            </div>
            </Fragment>
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
            bottom: "calc(6rem + env(safe-area-inset-bottom))",
            background: "rgba(255,248,240,0.9)",
            border: "1.5px dashed #c8a0e0",
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
          className="animate-slide-up rounded-t-2xl relative"
          style={{ background: "var(--chat-card-bg)", maxHeight: 280 }}
        >
          <div className="flex items-center justify-between px-4 py-2">
            <span className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--chat-text)" }}>
              <img src="/assets/decorations/小蝴蝶结.png" alt="" style={{ width: 14, height: 14, imageRendering: "pixelated" }} />
              表情包
            </span>
            <button onClick={() => setShowStickerPanel(false)} className="p-1 active:opacity-60">
              <X size={18} style={{ color: "var(--chat-text-muted)" }} />
            </button>
          </div>
          <div style={{ height: 200, overflowY: "auto", padding: "0 8px" }}>
            <div className="sticker-grid" style={{ padding: 8 }}>
            {/* Add button - square */}
            <button
              onClick={() => stickerInputRef.current?.click()}
              className="flex aspect-square h-auto w-full items-center justify-center rounded-xl"
              style={{ background: "var(--chat-input-bg)", border: "1px dashed var(--chat-accent)" }}
            >
              <Plus size={22} style={{ color: "var(--chat-accent-dark)" }} />
            </button>
            <input ref={stickerInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddSticker} />
            {stickers.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  if (deletingSticker === s.key) return;
                  if (deletingSticker) {
                    setDeletingSticker(null);
                    setStickerDeleteConfirm(false);
                    return;
                  }
                  selectSticker(s.key);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeletingSticker(s.key);
                  setStickerDeleteConfirm(false);
                }}
                onTouchStart={(e) => {
                  const timer = setTimeout(() => {
                    setDeletingSticker(s.key);
                    setStickerDeleteConfirm(false);
                  }, 500);
                  e.currentTarget.dataset.timer = timer;
                }}
                onTouchEnd={(e) => {
                  clearTimeout(e.currentTarget.dataset.timer);
                }}
                onTouchMove={(e) => {
                  clearTimeout(e.currentTarget.dataset.timer);
                }}
                className="aspect-square h-auto w-full rounded-xl overflow-hidden active:scale-90 transition"
                style={{ background: "var(--chat-input-bg)", WebkitTouchCallout: "none" }}
              >
                {stickerUrls[s.key] && (
                  <img
                    src={stickerUrls[s.key]}
                    alt=""
                    className="h-full w-full object-contain pointer-events-none select-none"
                    style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
                    draggable={false}
                  />
                )}
              </button>
            ))}
            </div>
          </div>
          {/* Delete bubble - outside scroll container */}
          {deletingSticker && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 flex gap-2" style={{ zIndex: 9999 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (stickerDeleteConfirm) {
                    handleRemoveSticker(deletingSticker);
                    setDeletingSticker(null);
                    setStickerDeleteConfirm(false);
                  } else {
                    setStickerDeleteConfirm(true);
                  }
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap"
                style={{
                  background: stickerDeleteConfirm ? "#ef4444" : "#e8a0b8",
                  color: "#ffffff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  border: "2px solid #ffffff",
                }}
              >
                {stickerDeleteConfirm ? "确认删除" : "删除"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingSticker(null);
                  setStickerDeleteConfirm(false);
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap"
                style={{
                  background: "#9ca3af",
                  color: "#ffffff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  border: "2px solid #ffffff",
                }}
              >
                取消
              </button>
            </div>
          )}
        </div>
      )}

      {/* Decorative bar above input */}
      <div className="deco-bar" style={{ background: "rgba(255,248,255,0.85)" }}>
        <span className="deco-bar-item" style={{ color: "#b090a0" }}>♥ {assistantName || "Whisper"}</span>
        <span className="deco-bar-item" style={{ color: "#b090a0" }}>▶| ☆*.{sessionInfo?.title || "聊天中"}.+</span>
        <span className="deco-bar-item" style={{ color: "#b090a0" }}>♪ ★.*::☆ cute! :*:★</span>
        <span className="deco-bar-item" style={{ color: "#b090a0" }}>◇ *.+花与星光.* ◇</span>
      </div>

      {/* Input area */}
      <div
        ref={inputAreaRef}
        className="px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
        style={{ background: "rgba(255,248,255,0.85)", backdropFilter: "blur(12px)" }}
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
          <div className="flex gap-2 mb-2 overflow-x-auto py-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative shrink-0" style={{ width: 88, height: 88 }}>
                <div className="w-full h-full rounded-xl overflow-hidden" style={{ background: "var(--chat-input-bg)" }}>
                  {(att.type === "image" || att.type === "sticker") ? (
                    <img src={att.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 w-full h-full px-2 text-xs" style={{ color: "var(--chat-text)" }}>
                      <FileIcon size={20} />
                      <span className="w-full text-center truncate text-[10px]">{att.name}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full text-white text-base font-medium"
                  style={{ background: "var(--chat-accent-dark)", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}
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
            <button onClick={() => attachmentInputRef.current?.click()} className="toolbar-icon-btn flex-1">
              <img src="/assets/pixel/像素文件图标.png" alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>附件</span>
            </button>
            <button onClick={openStickerPanel} className="toolbar-icon-btn flex-1">
              <img src="/assets/decorations/笑脸.png" alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>表情包</span>
            </button>
            <button onClick={() => { setShowToolbar(false); alert("气泡设置开发中"); }} className="toolbar-icon-btn flex-1">
              <img src="/assets/pixel/像素输入中气泡.png" alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>气泡</span>
            </button>
            <button onClick={() => { setShowToolbar(false); alert("背景设置开发中"); }} className="toolbar-icon-btn flex-1">
              <img src="/assets/decorations/花朵.png" alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>背景</span>
            </button>
            <input ref={attachmentInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.mp3,.mp4,.mov,.avi,.md,.json,.js,.py,.java,.c,.cpp,.css,.html,.xml,.yaml,.yml,.sh,.sql,.log" className="hidden" onChange={handleAttachmentSelect} />
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          {/* Toolbar toggle — bigger cat paw */}
          <button
            onClick={() => { setShowToolbar(!showToolbar); setShowStickerPanel(false); }}
            className="mb-1 p-1 active:scale-90 transition"
          >
            <img
              src="/assets/pixel/像素粉色猫爪.png"
              alt="+"
              style={{
                width: 30, height: 30,
                imageRendering: "pixelated",
                opacity: showToolbar ? 1 : 0.5,
                transform: showToolbar ? "rotate(45deg)" : "none",
                transition: "transform 0.2s, opacity 0.2s",
              }}
            />
          </button>

          {/* Input */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            rows={1}
            className="flex-1 dashed-input px-3.5 text-sm outline-none resize-none max-h-24 overflow-y-auto"
            style={{
              color: "var(--chat-text)",
              height: Math.min(24 + input.split("\n").length * 20, 96),
              paddingTop: 10,
              paddingBottom: 4,
            }}
          />

          {/* Action buttons — pixel icons, same size as cat paw */}
          <button
            onClick={mode === "normal" ? receiveNormal : collectAndSend}
            disabled={streaming || loading}
            className="mb-1 p-0.5 disabled:opacity-30 active:scale-90 transition"
          >
            <img src="/assets/pixel/像素黄色信封.png" alt="收" style={{ width: 30, height: 30, imageRendering: "pixelated" }} />
          </button>
          <button
            onClick={mode === "normal" ? (streaming ? stopStream : sendNormal) : sendShort}
            disabled={mode === "normal" ? (!streaming && !input.trim() && attachments.length === 0) : !input.trim()}
            className="mb-1 p-0.5 disabled:opacity-30 active:scale-90 transition"
          >
            {streaming ? (
              <img src="/assets/pixel/像素沙漏.png" alt="暂停" style={{ width: 30, height: 30, imageRendering: "pixelated" }} />
            ) : (
              <img src="/assets/decorations/信封 (2).png" alt="发送" style={{ width: 30, height: 30, imageRendering: "pixelated" }} />
            )}
          </button>
        </div>
      </div>

      {/* Context Menu — vertical icon column */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={closeContextMenu}
          />
          <div
            className="fixed z-[101] animate-slide-in flex items-center py-1 px-1"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              borderRadius: 16,
              background: "var(--chat-card-bg)",
              border: "1px solid var(--chat-accent)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            }}
          >
            {(() => {
              const role = contextMenu.message.role;
              const items = role === "system"
                ? [{ icon: Trash2, label: "删除", action: () => handleDelete(contextMenu.message), danger: true }]
                : [
                    { icon: Quote, label: "引用", action: () => handleQuote(contextMenu.message) },
                    { icon: Copy, label: "复制", action: () => handleCopy(contextMenu.message) },
                    role === "user"
                      ? { icon: Pencil, label: "编辑", action: () => handleEdit(contextMenu.message) }
                      : { icon: RotateCcw, label: "重回", action: () => handleReReply(contextMenu.message) },
                    { icon: Trash2, label: "删除", action: () => handleDelete(contextMenu.message), danger: true },
                  ];
              return items.map((item, idx) => (
                <div key={item.label} className="flex items-center">
                  {idx > 0 && (
                    <div style={{ width: 1, height: 28, borderLeft: "1px dashed var(--chat-accent)" }} />
                  )}
                  <button
                    onClick={item.action}
                    className="flex flex-col items-center justify-center active:scale-90 transition-transform"
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      color: item.danger ? "#ef4444" : "var(--chat-text)",
                      background: "transparent",
                    }}
                  >
                    <item.icon size={17} strokeWidth={1.8} />
                    <span style={{ fontSize: 9, marginTop: 1, opacity: 0.7 }}>{item.label}</span>
                  </button>
                </div>
              ));
            })()}
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
