import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Upload, Link, RotateCcw, Image as ImageIcon, MessageCircle, BookText, Palette, Settings, Heart, Globe, Book, Clapperboard, Plus, ExternalLink } from "lucide-react";
import Modal from "../components/Modal";

// Icon Definitions map
const iconMap = [
  { id: 'dock_chat', label: 'Dock - Chat', defaultIcon: MessageCircle, section: 'Dock栏' },
  { id: 'dock_memory', label: 'Dock - 记忆', defaultIcon: BookText, section: 'Dock栏' },
  { id: 'dock_theme', label: 'Dock - 美化', defaultIcon: Palette, section: 'Dock栏' },
  { id: 'dock_settings', label: 'Dock - 设置', defaultIcon: Settings, section: 'Dock栏' },
  { id: 'widget_love', label: '情侣空间', defaultIcon: Heart, section: '桌面应用' },
  { id: 'widget_world', label: '世界书', defaultIcon: Globe, section: '桌面应用' },
  { id: 'widget_diary', label: '日记', defaultIcon: Book, section: '桌面应用' },
  { id: 'widget_theater', label: '小剧场', defaultIcon: Clapperboard, section: '桌面应用' },
  { id: 'widget_tbd1', label: '待定1', defaultIcon: Plus, section: '桌面应用' },
  { id: 'widget_tbd2', label: '待定2', defaultIcon: Plus, section: '桌面应用' },
];

export default function IconSettings() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [customIcons, setCustomIcons] = useState({});
  const [editingIcon, setEditingIcon] = useState(null); // { id, label }
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("custom-icons") || "{}");
      setCustomIcons(saved);
    } catch (e) {
      console.error("Failed to load custom icons", e);
    }
  }, []);

  const saveIcons = (newIcons) => {
    setCustomIcons(newIcons);
    localStorage.setItem("custom-icons", JSON.stringify(newIcons));
    window.dispatchEvent(new Event("custom-icons-updated"));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && editingIcon) {
      const url = URL.createObjectURL(file);
      const newIcons = { ...customIcons, [editingIcon.id]: url };
      saveIcons(newIcons);
      setEditingIcon(null);
      e.target.value = null;
    }
  };

  const handleUrlSubmit = () => {
    if (imageUrl && editingIcon) {
      const newIcons = { ...customIcons, [editingIcon.id]: imageUrl };
      saveIcons(newIcons);
      setUrlModalOpen(false);
      setImageUrl("");
      setEditingIcon(null);
    }
  };

  const handleResetIcon = (id, e) => {
    e.stopPropagation();
    const newIcons = { ...customIcons };
    delete newIcons[id];
    saveIcons(newIcons);
  };

  const openEdit = (icon) => {
    setEditingIcon(icon);
  };

  // Group icons by section
  const sections = iconMap.reduce((acc, icon) => {
    if (!acc[icon.section]) acc[icon.section] = [];
    acc[icon.section].push(icon);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col bg-[#F5F5F7] text-black">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pb-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <button 
          onClick={() => navigate("/theme", { replace: true })}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold">图标样式</h1>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-24">
        {Object.entries(sections).map(([sectionName, icons]) => (
          <div key={sectionName} className="mb-8">
            <h2 className="mb-4 text-sm font-bold text-black uppercase tracking-wider">{sectionName}</h2>
            <div className="grid grid-cols-4 gap-4">
              {icons.map((icon) => {
                const DefaultIcon = icon.defaultIcon;
                const customUrl = customIcons[icon.id];
                
                return (
                  <div key={icon.id} className="flex flex-col items-center gap-2">
                    <button 
                      onClick={() => openEdit(icon)}
                      className="relative flex h-16 w-16 items-center justify-center rounded-[20px] bg-white shadow-sm transition active:scale-95 overflow-hidden group"
                    >
                      {customUrl ? (
                        <img src={customUrl} alt={icon.label} className="h-full w-full object-cover" />
                      ) : (
                        <DefaultIcon size={28} className="text-black" />
                      )}

                      {customUrl && (
                        <div 
                          onClick={(e) => handleResetIcon(icon.id, e)}
                          className="absolute bottom-0 right-0 p-1 bg-white/80 backdrop-blur-sm rounded-tl-lg cursor-pointer hover:text-red-500"
                        >
                          <RotateCcw size={12} />
                        </div>
                      )}
                    </button>
                    <span className="text-[11px] font-medium text-gray-500 text-center leading-tight">
                      {icon.label.replace('Dock - ', '')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal / Bottom Sheet */}
      {editingIcon && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setEditingIcon(null)}
        >
          <div 
            className="w-full max-w-[420px] rounded-t-[32px] bg-white p-6 shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">更换图标</h3>
              <button 
                onClick={() => setEditingIcon(null)}
                className="rounded-full bg-gray-100 p-2 text-gray-500"
              >
                <ChevronLeft size={20} className="-rotate-90" />
              </button>
            </div>

            <div className="flex items-center gap-4 mb-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-gray-50 border border-gray-100 overflow-hidden shadow-inner">
                {customIcons[editingIcon.id] ? (
                  <img src={customIcons[editingIcon.id]} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <editingIcon.defaultIcon size={32} className="text-gray-400" />
                )}
              </div>
              <div>
                <p className="font-bold text-lg">{editingIcon.label}</p>
                <p className="text-sm text-gray-400">选择图片上传或输入链接</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-gray-50 py-6 active:bg-gray-100 transition"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-black">
                  <ImageIcon size={20} />
                </div>
                <span className="text-sm font-medium">相册上传</span>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden" 
                />
              </button>

              <button 
                onClick={() => setUrlModalOpen(true)}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-gray-50 py-6 active:bg-gray-100 transition"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-black">
                  <Link size={20} />
                </div>
                <span className="text-sm font-medium">输入链接</span>
              </button>
            </div>
            
            {customIcons[editingIcon.id] && (
              <button
                onClick={(e) => {
                  handleResetIcon(editingIcon.id, e);
                  setEditingIcon(null);
                }}
                className="mt-4 w-full rounded-2xl py-4 text-sm font-medium text-red-500 hover:bg-red-50 transition"
              >
                恢复默认图标
              </button>
            )}
          </div>
        </div>
      )}

      {/* URL Input Modal */}
      <Modal
        isOpen={urlModalOpen}
        onClose={() => setUrlModalOpen(false)}
        title="输入图标链接"
        onConfirm={handleUrlSubmit}
        isConfirmDisabled={!imageUrl.trim()}
      >
        <input
          type="text"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://example.com/icon.png"
          className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none focus:ring-0 placeholder:text-gray-400"
        />
      </Modal>
    </div>
  );
}
