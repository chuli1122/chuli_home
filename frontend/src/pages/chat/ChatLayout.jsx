import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { MessageCircle, Users, User, ChevronLeft, Plus } from "lucide-react";
import { apiFetch } from "../../utils/api";
import Modal from "../../components/Modal";

const tabs = [
  { key: "messages", label: "消息", icon: MessageCircle, path: "/chat/messages" },
  { key: "contacts", label: "通讯录", icon: Users, path: "/chat/contacts" },
  { key: "me", label: "我", icon: User, path: "/chat/about" },
];

export default function ChatLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const hideTab =
    location.pathname.match(/\/chat\/(session|assistant)\//) !== null;

  const currentTab = tabs.find((t) => location.pathname.startsWith(t.path));
  const showPlus = currentTab && (currentTab.key === "messages" || currentTab.key === "contacts");

  // Messages tab: dropdown
  const [showMsgMenu, setShowMsgMenu] = useState(false);
  const menuRef = useRef(null);

  // Contacts tab: create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMsgMenu(false);
      }
    };
    if (showMsgMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMsgMenu]);

  // Close dropdown on tab change
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
    navigate("/chat/messages", { state: { action: "chat" } });
  };

  const startGroup = () => {
    setShowMsgMenu(false);
    navigate("/chat/messages", { state: { action: "group" } });
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
      navigate(`/chat/assistant/${data.id}`);
    } catch (e) {
      console.error("Failed to create assistant", e);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#F5F5F7] text-black">
      {/* Header - AppSettings style */}
      {!hideTab && (
        <div className="relative flex items-center justify-between px-6 pb-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
          <button
            onClick={() => navigate("/", { replace: true })}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold">
            {currentTab ? currentTab.label : "聊天"}
          </h1>
          {showPlus ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={handlePlusClick}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition"
              >
                <Plus size={20} />
              </button>
              {/* Messages dropdown */}
              {showMsgMenu && (
                <div className="absolute right-0 top-12 z-50 w-36 rounded-2xl bg-white shadow-lg overflow-hidden animate-slide-in">
                  <button
                    onClick={startChat}
                    className="flex w-full items-center px-4 py-3 text-sm active:bg-gray-50"
                  >
                    开始聊天
                  </button>
                  <div className="mx-3 h-[1px] bg-gray-100" />
                  <button
                    onClick={startGroup}
                    className="flex w-full items-center px-4 py-3 text-sm active:bg-gray-50"
                  >
                    发起群聊
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="w-10" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>

      {/* Bottom Tab Bar */}
      {!hideTab && (
        <nav className="flex items-center justify-around border-t border-gray-200/60 bg-white/80 backdrop-blur-md pb-[env(safe-area-inset-bottom)] px-2 pt-1.5">
          {tabs.map((tab) => {
            const active = location.pathname.startsWith(tab.path);
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => navigate(tab.path, { replace: true })}
                className="flex flex-col items-center gap-0.5 px-4 py-1.5"
              >
                <Icon
                  size={22}
                  className={active ? "text-black" : "text-gray-400"}
                />
                <span
                  className={`text-[10px] ${
                    active ? "font-medium text-black" : "text-gray-400"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Create assistant modal (for Contacts tab) */}
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
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400"
          autoFocus
        />
      </Modal>
    </div>
  );
}
