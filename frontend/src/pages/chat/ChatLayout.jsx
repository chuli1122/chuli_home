import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { MessageCircle, Users, User, ArrowLeft } from "lucide-react";

const tabs = [
  { key: "messages", label: "消息", icon: MessageCircle, path: "/chat/messages" },
  { key: "contacts", label: "通讯录", icon: Users, path: "/chat/contacts" },
  { key: "me", label: "我", icon: User, path: "/chat/me" },
];

export default function ChatLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const hideTab =
    location.pathname.match(/\/chat\/(session|assistant)\//) !== null;

  const currentTab = tabs.find((t) => location.pathname.startsWith(t.path));

  return (
    <div className="flex h-full flex-col bg-[var(--app-bg)]">
      {/* Header */}
      {!hideTab && (
        <div className="flex items-center px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
          <button
            onClick={() => navigate("/", { replace: true })}
            className="mr-3 rounded-full p-1.5 active:bg-black/5"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-semibold">
            {currentTab ? currentTab.label : "聊天"}
          </h1>
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
                    active
                      ? "font-medium text-black"
                      : "text-gray-400"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
