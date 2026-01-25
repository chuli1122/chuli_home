import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Server, Mic2, Volume2, Bell, MessageSquare, RotateCcw } from "lucide-react";
import Modal from "../components/Modal";

export default function AppSettings() {
  const navigate = useNavigate();
  
  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("app-settings"));
      if (saved) {
        return {
          backgroundNotifications: false,
          autoMessage: false,
          autoMessageIntervalMin: 30,
          autoMessageIntervalMax: 60,
          ...saved
        };
      }
    } catch (e) {
      console.error("Failed to load app settings", e);
    }
    return {
      backgroundNotifications: false,
      autoMessage: false,
      autoMessageIntervalMin: 30,
      autoMessageIntervalMax: 60,
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

  const handleIntervalChange = (key, value) => {
    if (value === "") {
      setSettings(prev => ({ ...prev, [key]: "" }));
      return;
    }
    const num = parseInt(value);
    if (!isNaN(num) && num >= 0) {
      setSettings(prev => ({ ...prev, [key]: num }));
    }
  };

  const handleBlur = (key) => {
    let currentVal = settings[key];
    
    // Default fallback if empty
    if (currentVal === "" || currentVal === undefined || isNaN(currentVal)) {
      currentVal = key === 'autoMessageIntervalMin' ? 30 : 60;
    }

    // Ensure non-negative
    if (currentVal < 0) currentVal = 0;

    let newMin = key === 'autoMessageIntervalMin' ? currentVal : settings.autoMessageIntervalMin;
    let newMax = key === 'autoMessageIntervalMax' ? currentVal : settings.autoMessageIntervalMax;

    // Handle min > max swap
    if (newMin > newMax) {
      const temp = newMin;
      newMin = newMax;
      newMax = temp;
    }

    setSettings(prev => ({
      ...prev,
      autoMessageIntervalMin: newMin,
      autoMessageIntervalMax: newMax
    }));
  };

  const handleReset = () => {
    const defaultSettings = {
      backgroundNotifications: false,
      autoMessage: false,
      autoMessageIntervalMin: 30,
      autoMessageIntervalMax: 60,
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
            onClick={() => handleNavigate("/settings/api")}
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

          {/* Separator */}
          <div className="mx-4 h-[1px] bg-gray-100" />

          {/* Auto Message */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-gray-900">
                  <MessageSquare size={20} strokeWidth={1.5} />
                </div>
                <span className="text-[15px] font-medium">开启主动发消息</span>
              </div>
              <button 
                onClick={() => handleToggle('autoMessage')}
                className={`relative h-7 w-12 rounded-full transition-colors duration-200 ease-in-out ${settings.autoMessage ? 'bg-black' : 'bg-gray-200'}`}
              >
                <span 
                  className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${settings.autoMessage ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {/* Interval Settings (Conditional) */}
            {settings.autoMessage && (
              <div className="px-4 pb-5 pt-0 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="ml-[56px] flex items-center justify-between rounded-xl bg-[#F5F5F7] p-3">
                  <span className="text-xs font-medium text-gray-500">间隔 (分钟)</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={settings.autoMessageIntervalMin}
                      onChange={(e) => handleIntervalChange('autoMessageIntervalMin', e.target.value)}
                      onBlur={() => handleBlur('autoMessageIntervalMin')}
                      className="w-12 rounded-lg bg-white px-1 py-1 text-center text-sm font-bold shadow-sm outline-none focus:ring-1 focus:ring-black/10"
                    />
                    <span className="text-gray-400">~</span>
                    <input 
                      type="number" 
                      value={settings.autoMessageIntervalMax}
                      onChange={(e) => handleIntervalChange('autoMessageIntervalMax', e.target.value)}
                      onBlur={() => handleBlur('autoMessageIntervalMax')}
                      className="w-12 rounded-lg bg-white px-1 py-1 text-center text-sm font-bold shadow-sm outline-none focus:ring-1 focus:ring-black/10"
                    />
                  </div>
                </div>
              </div>
            )}
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
