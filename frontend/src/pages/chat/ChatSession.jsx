import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronDown, X,
  File as FileIcon, Plus,
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
  const [deletingSticker, setDeletingSticker] = useState(null); // key of sticker showing delete bubble
  const [stickerDeleteConfirm, setStickerDeleteConfirm] = useState(false); // whether in confirm state

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
      const msgs = (data.messages || []).filter(
        (m) => m.role === "user" || m.role === "assistant" || m.role === "system"
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

        // Multiple fallback scroll attempts with different timings
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          } else if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 50);

        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          }
        }, 150);

        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          }
        }, 300);
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

  // Mood — persist to latest summary's mood_tag
  const selectMood = async (key) => {
    setCurrentMood(key);
    setShowMoodPicker(false);
    try {
      const sumData = await apiFetch(`/api/sessions/${id}/summaries`);
      const latest = (sumData.summaries || [])[0];
      if (latest) {
        const res = await apiFetch(`/api/sessions/${id}/summaries/${latest.id}`, {
          method: "PUT",
          body: { mood_tag: key },
        });
        // Append system message to chat
        if (res.system_message) {
          setMessages((prev) => [...prev, res.system_message]);
        }
      }
    } catch {}
  };

  // Search
  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await apiFetch(`/api/sessions/${id}/messages?search=${encodeURIComponent(searchQuery.trim())}`);
      const all = (data.messages || []).filter(
        (m) => m.role === "user" || m.role === "assistant" || m.role === "system"
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
      setAttachments((prev) => [...prev, { type: "sticker", key: stickerKey, url, imageId: stickerKey }]);
    }
    setShowStickerPanel(false);
  };

  const handleRemoveSticker = async (stickerKey) => {
    await removeSticker(stickerKey);
    loadStickers();
  };

  // Attachments
  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await saveImage(imageId, file);
    const url = URL.createObjectURL(file);
    setAttachments((prev) => [...prev, { type: "image", file, url, name: file.name, imageId }]);
    setShowToolbar(false);
    e.target.value = "";
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      setMessages((prev) => prev.filter((m) => m.id !== deletingMessage.id));
    } catch (e) {
      console.error("Delete failed", e);
    }
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
    streamContentRef.current = "";
    const aiMsgId = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: aiMsgId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);

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
              {sessionInfo?.title || assistantName || `会话 ${id}`}
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
              <img src="/assets/decorations/灯泡.png" alt="" style={{ width: 16, height: 16, imageRendering: "pixelated", opacity: 0.6 }} />
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
          // System notification — centered small text
          if (msg.role === "system") {
            return (
              <div key={msg.id || i} id={`msg-${msg.id}`} className="mb-3 flex justify-center">
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
                    fontSize: 11, color: "#b0a0b8",
                    background: "rgba(0,0,0,0.04)",
                    userSelect: "none", WebkitUserSelect: "none",
                  }}
                >
                  {msg.content}
                </span>
              </div>
            );
          }
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
                    {msg.content ? (
                      <MessageContent
                        content={msg.content}
                        isMarkdown={!isUser}
                      />
                    ) : (
                      streaming && !isUser ? "..." : ""
                    )}
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
            <button onClick={() => imageInputRef.current?.click()} className="toolbar-icon-btn flex-1">
              <img src="/assets/decorations/相框.png" alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>图片</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="toolbar-icon-btn flex-1">
              <img src="/assets/pixel/像素文件图标.png" alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
              <span className="text-[10px]" style={{ color: "var(--chat-text)" }}>文件</span>
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
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
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
            {contextMenu.message.role === "system" ? (
              <button
                onClick={() => handleDelete(contextMenu.message)}
                className="py-2 text-xs hover:bg-black/5 active:bg-black/10 text-red-500 rounded-full"
                style={{ width: "52px" }}
              >
                删除
              </button>
            ) : (
              <>
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
              </>
            )}
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
