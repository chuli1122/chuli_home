import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Server, Mic2, Volume2, Bell, MessageSquare, RotateCcw } from "lucide-react";

export default function AppSettings() {
  const navigate = useNavigate();

  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("app-settings"));
      if (saved) {
        return {
          backgroundNotifications: false,
          ...saved
        };
      }
    } catch (e) {
      console.error("Failed to load app settings", e);
    }
    return {
      backgroundNotifications: false,
    };
  });

  const [toast, setToast] = useState({ show: false, message: '' });

  // Save settings whenever they change
  useEffect(() => {
    localStorage.setItem("app-settings", JSON.stringify(settings));
  }, [settings]);

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ ...toast, show: false }), 2000);
  };

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleReset = () => {
    const defaultSettings = {
      backgroundNotifications: false,
    };
    setSettings(defaultSettings);
    showToast("已重置");
  };

  // Mock navigation for sub-pages
  const handleNavigate = (path) => {
    // navigate(path, { replace: true });
    showToast("功能开发中");
  };

  return (
    <div className="flex h-full flex-col bg-[#F5F5F7] text-black">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pb-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <button
          onClick={() => navigate("/", { replace: true })}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold">应用设置</h1>
        <button
          onClick={handleReset}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition text-gray-500"
        >
          <RotateCcw size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-6">

        {/* General Settings Group */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => navigate("/settings/api", { replace: true })}
            className="flex w-full items-center justify-between rounded-[24px] bg-white p-5 shadow-sm active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-gray-900">
                <Server size={20} strokeWidth={1.5} />
              </div>
              <span className="text-[15px] font-medium">API 设置</span>
            </div>
            <ChevronRight size={20} className="text-gray-300" />
          </button>

          <button
            onClick={() => handleNavigate("/settings/voice-clone")}
            className="flex w-full items-center justify-between rounded-[24px] bg-white p-5 shadow-sm active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-gray-900">
                <Mic2 size={20} strokeWidth={1.5} />
              </div>
              <span className="text-[15px] font-medium">克隆音色设置</span>
            </div>
            <ChevronRight size={20} className="text-gray-300" />
          </button>

          <button
            onClick={() => handleNavigate("/settings/notification-sound")}
            className="flex w-full items-center justify-between rounded-[24px] bg-white p-5 shadow-sm active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-gray-900">
                <Volume2 size={20} strokeWidth={1.5} />
              </div>
              <span className="text-[15px] font-medium">消息提示音</span>
            </div>
            <ChevronRight size={20} className="text-gray-300" />
          </button>

          <button
            onClick={() => navigate("/settings/proactive", { replace: true })}
            className="flex w-full items-center justify-between rounded-[24px] bg-white p-5 shadow-sm active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-gray-900">
                <MessageSquare size={20} strokeWidth={1.5} />
              </div>
              <div>
                <span className="text-[15px] font-medium">主动发消息</span>
                <p className="text-[11px] text-gray-400 mt-0.5">定时触发 AI 发送消息</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-300" />
          </button>
        </div>

        {/* Toggles Group */}
        <div className="rounded-[24px] bg-white p-2 shadow-sm">
          {/* Background Notification */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-gray-900">
                <Bell size={20} strokeWidth={1.5} />
              </div>
              <span className="text-[15px] font-medium">开启后台通知</span>
            </div>
            <button
              onClick={() => handleToggle('backgroundNotifications')}
              className={`relative h-7 w-12 rounded-full transition-colors duration-200 ease-in-out ${settings.backgroundNotifications ? 'bg-black' : 'bg-gray-200'}`}
            >
              <span
                className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${settings.backgroundNotifications ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </div>

      </div>

      {/* Toast */}
      {toast.show && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] animate-in fade-in zoom-in duration-200">
          <div className="bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-lg font-medium text-sm">
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
