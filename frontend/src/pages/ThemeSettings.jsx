import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ChevronLeft, 
  ChevronRight, 
  Image as ImageIcon, 
  Type as TypeIcon, 
  LayoutGrid as IconIcon, 
  MessageCircle as BubbleIcon,
  AppWindow
} from "lucide-react";

export default function ThemeSettings() {
  const navigate = useNavigate();
  const [toast, setToast] = useState({ show: false, message: '' });

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ ...toast, show: false }), 2000);
  };

  const handleNavigate = (path) => {
    if (path === "/theme/bubbles") {
      showToast("功能开发中");
      return;
    }
    navigate(path, { replace: true });
  };

  const settingsItems = [
    { icon: ImageIcon, label: "背景设置", path: "/theme/background" },
    { icon: AppWindow, label: "组件设置", path: "/theme/components" },
    { icon: TypeIcon, label: "字体设置", path: "/theme/font" },
    { icon: IconIcon, label: "图标设置", path: "/theme/icons" },
    { icon: BubbleIcon, label: "气泡设置", path: "/theme/bubbles" },
  ];

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
        <h1 className="text-lg font-bold">美化设置</h1>
        <div className="w-10" /> {/* Spacer for centering title */}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-24">
        <div className="flex flex-col gap-4">
          {settingsItems.map((item, index) => (
            <button
              key={index}
              onClick={() => handleNavigate(item.path)}
              className="flex w-full items-center justify-between rounded-[24px] bg-white p-5 shadow-sm active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] text-gray-900">
                  <item.icon size={20} strokeWidth={1.5} />
                </div>
                <span className="text-[15px] font-medium">{item.label}</span>
              </div>
              <ChevronRight size={20} className="text-gray-300" />
            </button>
          ))}
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
