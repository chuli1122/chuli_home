import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { apiFetch } from "../../utils/api";
import Modal from "../../components/Modal";

const tabs = [
  { key: "messages", label: "消息", path: "/chat/messages" },
  { key: "contacts", label: "通讯录", path: "/chat/contacts" },
  { key: "me", label: "我", path: "/chat/about" },
];

export default function ChatLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const hideTab =
    location.pathname.match(/\/chat\/(session|assistant)\//) !== null;

  const currentTab = tabs.find((t) => location.pathname.startsWith(t.path));
  const showPlus =
    currentTab && (currentTab.key === "messages" || currentTab.key === "contacts");

  const [showMsgMenu, setShowMsgMenu] = useState(false);
  const menuRef = useRef(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMsgMenu(false);
      }
    };
    if (showMsgMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMsgMenu]);

  useEffect(() => {
    setShowMsgMenu(false);
    setShowCreate(false);
  }, [location.pathname]);

  const handlePlusClick = () => {
    if (currentTab?.key === "messages") {
      setShowMsgMenu((v) => !v);
    } else if (currentTab?.key === "contacts") {
      setShowCreate(true);
    }
  };

  const startChat = () => {
    setShowMsgMenu(false);
    navigate("/chat/messages", { replace: true, state: { action: "chat" } });
  };

  const startGroup = () => {
    setShowMsgMenu(false);
    navigate("/chat/messages", { replace: true, state: { action: "group" } });
  };

  const createAssistant = async () => {
    if (!newName.trim()) return;
    try {
      const data = await apiFetch("/api/assistants", {
        method: "POST",
        body: { name: newName.trim() },
      });
      setShowCreate(false);
      setNewName("");
      navigate(`/chat/assistant/${data.id}`, { replace: true });
    } catch (e) {
      console.error("Failed to create assistant", e);
    }
  };

  // Tab icons as inline pixel-art style SVGs
  const TabIcon = ({ tabKey, active }) => {
    const color = active ? "var(--chat-accent-dark)" : "#c0a0b0";
    if (tabKey === "messages") {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="13" rx="3" stroke={color} strokeWidth="1.8" fill={active ? "var(--chat-bg)" : "none"} />
          <path d="M7 16 L12 20 L12 16" fill={color} />
          <circle cx="8" cy="10.5" r="1.2" fill={color} />
          <circle cx="12" cy="10.5" r="1.2" fill={color} />
          <circle cx="16" cy="10.5" r="1.2" fill={color} />
        </svg>
      );
    }
    if (tabKey === "contacts") {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="9" r="4" stroke={color} strokeWidth="1.8" fill={active ? "var(--chat-bg)" : "none"} />
          <path d="M5 20 C5 16, 8 14, 12 14 C16 14, 19 16, 19 20" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <circle cx="18" cy="7" r="2.5" stroke={color} strokeWidth="1.4" fill={active ? "var(--chat-bg)" : "none"} />
        </svg>
      );
    }
    // me
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4.5" stroke={color} strokeWidth="1.8" fill={active ? "var(--chat-bg)" : "none"} />
        <path d="M4 21 C4 16.5, 7.5 13.5, 12 13.5 C16.5 13.5, 20 16.5, 20 21" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
    );
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--chat-bg)" }}>
      {/* Header */}
      {!hideTab && (
        <div className="relative flex items-center justify-between px-5 pb-3 pt-[calc(1.25rem+env(safe-area-inset-top))]">
          <button
            onClick={() => navigate("/", { replace: true })}
            className="flex h-9 w-9 items-center justify-center rounded-full active:scale-95 transition"
            style={{ background: "var(--chat-card-bg)" }}
          >
            <ChevronLeft size={20} style={{ color: "var(--chat-text)" }} />
          </button>
          <h1 className="text-lg font-bold" style={{ color: "var(--chat-text)" }}>
            {currentTab ? currentTab.label : "聊天"}
          </h1>
          {showPlus ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={handlePlusClick}
                className="flex h-9 w-9 items-center justify-center rounded-full active:scale-95 transition"
                style={{ background: "var(--chat-card-bg)" }}
              >
                <Plus size={18} style={{ color: "var(--chat-text)" }} />
              </button>
              {showMsgMenu && (
                <div className="absolute right-0 top-11 z-50 w-36 rounded-2xl shadow-lg overflow-hidden animate-slide-in" style={{ background: "var(--chat-card-bg)" }}>
                  <button
                    onClick={startChat}
                    className="flex w-full items-center px-4 py-3 text-sm active:bg-black/5"
                    style={{ color: "var(--chat-text)" }}
                  >
                    开始聊天
                  </button>
                  <div className="mx-3 h-[1px]" style={{ background: "var(--chat-accent)" , opacity: 0.3 }} />
                  <button
                    onClick={startGroup}
                    className="flex w-full items-center px-4 py-3 text-sm active:bg-black/5"
                    style={{ color: "var(--chat-text)" }}
                  >
                    发起群聊
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-9" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>

      {/* Bottom Tab Bar */}
      {!hideTab && (
        <nav
          className="flex items-center justify-around px-2 pt-1.5 pb-[env(safe-area-inset-bottom)]"
          style={{
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(228,160,184,0.25)",
          }}
        >
          {tabs.map((tab) => {
            const active = location.pathname.startsWith(tab.path);
            return (
              <button
                key={tab.key}
                onClick={() => navigate(tab.path, { replace: true })}
                className="flex flex-col items-center gap-0.5 px-5 py-1.5"
              >
                <TabIcon tabKey={tab.key} active={active} />
                <span
                  className="text-[10px]"
                  style={{
                    color: active ? "var(--chat-accent-dark)" : "#c0a0b0",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Create assistant modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          setNewName("");
        }}
        title="创建助手"
        onConfirm={createAssistant}
        confirmText="保存"
        isConfirmDisabled={!newName.trim()}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="输入助手名称"
          className="w-full rounded-xl px-4 py-3 text-base outline-none"
          style={{ background: "var(--chat-input-bg)", border: "1px solid var(--chat-accent)" }}
          autoFocus
        />
      </Modal>
    </div>
  );
}
