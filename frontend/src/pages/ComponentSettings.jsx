import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, User2, Calendar, MessageCircle, BookText, Palette, Settings, MoreHorizontal, Check, Trash2, Image as ImageIcon, Plus, RotateCcw, Heart } from "lucide-react";

// Mock Components for Preview
const PreviewIcon = ({ style }) => (
  <div className="flex flex-col items-center justify-center gap-2 transition-all duration-300">
    <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] shadow-lg shadow-black/5">
      <div className="absolute inset-0 rounded-[28px] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundColor: style.backgroundImage ? 'transparent' : style.color,
            backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
            opacity: style.opacity / 100,
            backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
          }}
        />
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
          }}
        />
        {(style.material === 'glass' || style.material === 'frost') && (
          <div className="absolute inset-0 pointer-events-none rounded-[28px] border border-white/20" />
        )}
      </div>
      <Heart size={40} className="relative z-10 text-black" />
    </div>
    <span className="text-sm font-medium text-black/70">情侣空间</span>
  </div>
);

const PreviewProfileCard = ({ style, profile }) => (
  <div className={`relative w-full overflow-hidden rounded-[32px] text-center transition-all duration-300 ${(style.material === 'glass' || style.material === 'frost') ? 'border border-white/20' : ''}`}>
    {/* Background Layer */}
    <div 
      className="absolute inset-0 bg-cover bg-center shadow-lg shadow-black/5 rounded-[32px]"
      style={{ 
        backgroundColor: style.backgroundImage ? 'transparent' : style.color,
        backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
        opacity: style.opacity / 100,
        backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
      }}
    />
    
    {/* Material Overlay */}
    <div 
      className="absolute inset-0 pointer-events-none rounded-[32px]"
      style={{
        backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
      }}
    />

    {/* Border Layer */}
    {(style.material === 'glass' || style.material === 'frost') && (
      <div className="absolute inset-0 pointer-events-none rounded-[32px] border border-white/20" />
    )}
    
    {/* Content Layer */}
    <div className="relative z-10 px-6 pb-6 pt-5">
      <div className="mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full bg-gray-50 text-black shadow-sm border-4 border-white overflow-hidden">
        {profile?.avatar ? (
          <img src={profile.avatar} alt="Avatar" className="h-full w-full object-cover" />
        ) : (
          <User2 size={32} className="text-gray-400" />
        )}
      </div>
      <div className="mt-3 h-6 w-32 mx-auto bg-black/10 rounded-full" />
      <div className="mt-2 h-4 w-48 mx-auto bg-black/5 rounded-full" />
    </div>
  </div>
);

const PreviewWidget = ({ style, type = 'countdown' }) => (
  <div className="relative flex aspect-square w-full flex-col items-center justify-center rounded-[24px] transition-all duration-300 overflow-hidden">
    {/* Background Layer */}
    <div 
      className="absolute inset-0 bg-cover bg-center shadow-xl shadow-black/5 rounded-[24px]"
      style={{ 
        backgroundColor: style.backgroundImage ? 'transparent' : style.color,
        backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
        opacity: style.opacity / 100,
        backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
      }}
    />

    {/* Material Overlay */}
    <div 
      className="absolute inset-0 pointer-events-none rounded-[24px]"
      style={{
        backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
      }}
    />

    {/* Border Layer */}
    {(style.material === 'glass' || style.material === 'frost') && (
      <div className="absolute inset-0 pointer-events-none rounded-[24px] border border-white/30" />
    )}

    {/* Content Layer */}
    <div className="relative z-10 w-full h-full">
      {type === 'countdown' ? (
        <div className="flex flex-col w-full h-full">
          {/* Big Event (Top) */}
          <div className="relative flex flex-1 flex-col items-center justify-center p-4">
            <span className="text-xs font-medium text-gray-700 mb-1">恋爱纪念日</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-medium text-gray-700 mr-0.5">还有</span>
              <span className="text-4xl font-bold text-gray-700">99</span>
              <span className="text-xs font-medium text-gray-700">天</span>
            </div>
            <span className="text-[10px] text-gray-700 mt-1">2025-05-20</span>
          </div>

          {/* Small Events (Bottom) */}
          <div className="flex h-[35%] w-full border-t border-dashed border-black/10">
            <div className="flex flex-1 flex-col items-center justify-center p-2 border-r border-dashed border-black/10">
              <span className="truncate text-[10px] font-medium text-gray-700">我的生日</span>
              <div className="flex items-end gap-0.5 mb-1">
                <span className="text-[9px] text-gray-700 whitespace-nowrap">还有</span>
                <span className="text-lg font-bold text-gray-700 leading-none">296</span>
                <span className="text-[9px] text-gray-700 whitespace-nowrap">天</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center p-2">
              <span className="truncate text-[10px] font-medium text-gray-700">新年</span>
              <div className="flex items-end gap-0.5 mb-1">
                <span className="text-[9px] text-gray-700 whitespace-nowrap">还有</span>
                <span className="text-lg font-bold text-gray-700 leading-none">347</span>
                <span className="text-[9px] text-gray-700 whitespace-nowrap">天</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full text-gray-400">
          <div className="h-14 w-14 rounded-[18px] bg-black/5 mb-2" />
          <span className="text-xs font-medium">待定</span>
        </div>
      )}
    </div>
  </div>
);

const PreviewDock = ({ style }) => (
  <div className="relative w-full rounded-[36px] transition-all duration-300 overflow-hidden">
    {/* Background Layer */}
    <div 
      className="absolute inset-0 bg-cover bg-center shadow-2xl shadow-black/10 rounded-[36px]"
      style={{ 
        backgroundColor: style.backgroundImage ? 'transparent' : style.color,
        backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
        opacity: style.opacity / 100,
        backdropFilter: style.material === 'glass' ? 'blur(20px)' : style.material === 'frost' ? 'blur(10px)' : 'none',
      }}
    />

    {/* Material Overlay */}
    <div 
      className="absolute inset-0 pointer-events-none rounded-[36px]"
      style={{
        backgroundColor: style.material === 'glass' ? 'rgba(255,255,255,0.1)' : style.material === 'frost' ? 'rgba(255,255,255,0.3)' : 'transparent',
      }}
    />

    {/* Border Layer */}
    {(style.material === 'glass' || style.material === 'frost') && (
      <div className="absolute inset-0 pointer-events-none rounded-[36px] border border-white/20" />
    )}

    {/* Content Layer */}
    <div className="relative z-10 flex w-full items-center justify-between px-8 py-4">
      {[MessageCircle, BookText, Palette, Settings].map((Icon, i) => (
        <div key={i} className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-white/60 text-black/70 shadow-lg shadow-black/10 backdrop-blur-md">
          <Icon size={28} />
        </div>
      ))}
    </div>
  </div>
);

const TabButton = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-1 py-3 text-[15px] font-medium transition-colors relative ${
      active ? "text-black" : "text-gray-400"
    }`}
  >
    {label}
    {active && (
      <div className="absolute bottom-0 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-black" />
    )}
  </button>
);

const MaterialOption = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    className={`flex-1 rounded-xl py-2.5 text-xs font-medium transition-all ${
      active
        ? "bg-black text-white shadow-md"
        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
    }`}
  >
    {label}
  </button>
);

const PresetModal = ({ isOpen, onClose, onSave, onSelect, presets }) => {
  const [mode, setMode] = useState('select'); // 'select' | 'save'
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode('select');
      setPresetName('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-8" onClick={onClose}>
      <div 
        className="w-full max-w-[320px] rounded-[24px] bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-6 text-center text-[17px] font-bold text-black">预设管理</h3>
        
        <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
          <button 
            onClick={() => setMode('select')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${mode === 'select' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
          >
            选择预设
          </button>
          <button 
            onClick={() => setMode('save')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${mode === 'save' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
          >
            存为预设
          </button>
        </div>

        {mode === 'select' ? (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {presets.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">暂无预设</p>
            ) : (
              presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    onSelect(preset);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 active:scale-95 transition"
                >
                  <span>{preset.name}</span>
                  <span className="text-xs text-gray-400">{new Date(preset.id).toLocaleDateString()}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="输入预设名称..."
              className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] text-black outline-none focus:ring-2 focus:ring-black/5 placeholder:text-gray-400"
            />
            <button
              onClick={() => {
                if (presetName.trim()) {
                  onSave(presetName.trim());
                  onClose();
                }
              }}
              disabled={!presetName.trim()}
              className="w-full rounded-full bg-black py-3 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              保存
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function ComponentSettings() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState("profile"); // 'profile' | 'widget' | 'icon' | 'dock'
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presets, setPresets] = useState([]);
  const [activeWidgetPage, setActiveWidgetPage] = useState(0);
  const [userProfile, setUserProfile] = useState({ avatar: null });
  
  // Default Settings (Updated to match actual defaults)
  const defaultSettings = {
    profile: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
    widget: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
    icon: { opacity: 40, material: 'glass', color: '#ffffff', backgroundImage: null },
    dock: { opacity: 30, material: 'glass', color: '#ffffff', backgroundImage: null },
  };
  
  const [settings, setSettings] = useState(defaultSettings);

  // Load settings and presets
  useEffect(() => {
    try {
      const savedSettings = JSON.parse(localStorage.getItem("component-styles"));
      if (savedSettings) {
        // Deep merge with defaults to ensure all fields exist
        setSettings(prev => ({
          profile: { ...prev.profile, ...savedSettings.profile },
          widget: { ...prev.widget, ...savedSettings.widget },
          icon: { ...prev.icon, ...savedSettings.icon },
          dock: { ...prev.dock, ...savedSettings.dock },
        }));
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }

    const savedPresets = JSON.parse(localStorage.getItem("component-presets") || "[]");
    setPresets(savedPresets);
    
    try {
      const savedProfile = JSON.parse(localStorage.getItem("user-profile"));
      if (savedProfile) {
        setUserProfile(savedProfile);
      }
    } catch (e) {
      console.error("Failed to load user profile", e);
    }
  }, []);

  // Update setting (local state only)
  const updateSetting = (key, value) => {
    const newSettings = {
      ...settings,
      [activeTab]: { ...settings[activeTab], [key]: value }
    };
    setSettings(newSettings);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      updateSetting('backgroundImage', url);
      // Reset input
      e.target.value = null;
    }
  };

  const clearImage = () => {
    updateSetting('backgroundImage', null);
  };

  const handleReset = () => {
    const newSettings = {
      ...settings,
      [activeTab]: { ...defaultSettings[activeTab] }
    };
    setSettings(newSettings);
  };

  // Save and Apply
  const handleSaveAndApply = () => {
    localStorage.setItem("component-styles", JSON.stringify(settings));
    window.dispatchEvent(new Event("component-style-updated"));
    navigate(-1);
  };

  // Preset Handlers
  const handleSavePreset = (name) => {
    const newPreset = {
      id: Date.now(),
      name,
      settings: { ...settings }
    };
    const updatedPresets = [newPreset, ...presets];
    setPresets(updatedPresets);
    localStorage.setItem("component-presets", JSON.stringify(updatedPresets));
  };

  const handleSelectPreset = (preset) => {
    setSettings(preset.settings);
  };

  const handleWidgetScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.offsetWidth;
    const page = Math.round(scrollLeft / width);
    setActiveWidgetPage(page);
  };

  const currentStyle = settings[activeTab];

  return (
    <div className="flex h-full flex-col bg-[#F5F5F7] text-black">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pb-4 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <button 
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-95 transition"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold">组件设置</h1>
        <button 
          onClick={() => setIsPresetModalOpen(true)}
          className="flex h-10 px-4 items-center justify-center rounded-full bg-white shadow-sm text-[13px] font-medium active:scale-95 transition"
        >
          预设
        </button>
      </div>

      {/* Preview Area */}
      <div className="flex-1 flex items-center justify-center p-8 min-h-0">
        <div className="relative aspect-[9/19.5] h-full max-h-[500px] w-full overflow-hidden rounded-[32px] border-[6px] border-black bg-gray-200 shadow-2xl flex flex-col">
          {/* Wallpaper Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-pink-100 bg-cover bg-center" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000&auto=format&fit=crop)' }} />
          
          <div className="relative z-10 flex h-full flex-col p-4">
            {/* Dynamic Preview Content based on Active Tab */}
            
            {activeTab === 'profile' && (
              <div className="mt-4 transition-all duration-300 animate-in fade-in slide-in-from-top-4">
                <PreviewProfileCard style={settings.profile} profile={userProfile} />
              </div>
            )}
            
            {activeTab === 'widget' && (
              <div className="flex-1 flex flex-col items-center justify-center w-full overflow-hidden">
                {/* Scrollable Widget Preview */}
                <div 
                  className="flex w-full overflow-x-auto snap-x snap-mandatory no-scrollbar items-center h-64"
                  onScroll={handleWidgetScroll}
                >
                  <div className="snap-center shrink-0 w-full flex justify-center">
                    <div className="w-40 h-40">
                      <PreviewWidget style={settings.widget} type="countdown" />
                    </div>
                  </div>
                  <div className="snap-center shrink-0 w-full flex justify-center">
                    <div className="w-40 h-40">
                      <PreviewWidget style={settings.widget} type="placeholder" />
                    </div>
                  </div>
                  <div className="snap-center shrink-0 w-full flex justify-center">
                    <div className="w-40 h-40">
                      <PreviewWidget style={settings.widget} type="placeholder" />
                    </div>
                  </div>
                </div>
                
                {/* Pagination Dots */}
                <div className="flex justify-center gap-2 mt-6">
                  {[0, 1, 2].map((i) => (
                    <div 
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-colors ${
                        activeWidgetPage === i ? "bg-black/50" : "bg-black/10"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'icon' && (
              <div className="flex-1 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                <PreviewIcon style={settings.icon} />
              </div>
            )}

            {activeTab === 'dock' && (
              <div className="mt-auto mb-4 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
                <PreviewDock style={settings.dock} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls Area */}
      <div className="bg-white rounded-t-[32px] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-[calc(2rem+env(safe-area-inset-bottom))]">
        
        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          <TabButton active={activeTab === 'profile'} label="资料卡" onClick={() => setActiveTab('profile')} />
          <TabButton active={activeTab === 'widget'} label="小组件" onClick={() => setActiveTab('widget')} />
          <TabButton active={activeTab === 'icon'} label="图标" onClick={() => setActiveTab('icon')} />
          <TabButton active={activeTab === 'dock'} label="Dock栏" onClick={() => setActiveTab('dock')} />
        </div>

        {/* Settings */}
        <div className="p-6 space-y-6">
          
          {/* Opacity Slider */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <label className="text-xs font-medium text-gray-500">透明度</label>
              <span className="text-xs font-bold">{currentStyle.opacity}%</span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-gray-100">
              {/* Progress Bar */}
              <div 
                className="absolute left-0 top-0 h-full bg-black rounded-full" 
                style={{ width: `${currentStyle.opacity}%` }}
              />
              {/* Thumb */}
              <div 
                className="absolute top-1/2 -translate-y-1/2 h-4 w-4 bg-white border-2 border-black rounded-full shadow-sm pointer-events-none"
                style={{ left: `${currentStyle.opacity}%`, transform: `translate(-50%, -50%)` }} 
              />
              {/* Input */}
              <input
                type="range"
                min="0"
                max="100"
                value={currentStyle.opacity}
                onChange={(e) => updateSetting('opacity', parseInt(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          {/* Material Selector */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-gray-500">材质</label>
            <div className="flex gap-2">
              <MaterialOption 
                active={currentStyle.material === 'glass'} 
                label="毛玻璃" 
                onClick={() => updateSetting('material', 'glass')} 
              />
              <MaterialOption 
                active={currentStyle.material === 'frost'} 
                label="磨砂" 
                onClick={() => updateSetting('material', 'frost')} 
              />
              <MaterialOption 
                active={currentStyle.material === 'solid'} 
                label="纯色" 
                onClick={() => updateSetting('material', 'solid')} 
              />
            </div>
          </div>

          {/* Custom Image (Replaces Color Picker) */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-gray-500">自定义图片</label>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 text-gray-400 transition active:scale-95 hover:bg-gray-100"
              >
                {currentStyle.backgroundImage ? (
                  <img 
                    src={currentStyle.backgroundImage} 
                    alt="Background" 
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon size={20} />
                )}
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
              </button>
              
              {currentStyle.backgroundImage ? (
                <div className="flex flex-1 items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <span className="text-xs text-gray-500">已选择图片</span>
                  <button 
                    onClick={clearImage}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-red-100 hover:text-red-500 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex-1 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-400">
                  点击左侧图标上传图片
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition active:scale-95"
            >
              <RotateCcw size={20} />
            </button>
            <button
              onClick={handleSaveAndApply}
              className="flex-1 rounded-full bg-black py-3.5 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95"
            >
              保存并应用
            </button>
          </div>

        </div>
      </div>

      {/* Preset Modal */}
      <PresetModal 
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        onSave={handleSavePreset}
        onSelect={handleSelectPreset}
        presets={presets}
      />
    </div>
  );
}
