import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Image as ImageIcon, Check, Trash2 } from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";

export default function BackgroundSettings() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  // State
  const [wallpapers, setWallpapers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteSelection, setDeleteSelection] = useState(new Set());
  const [applyScope, setApplyScope] = useState('all'); // 'all' | 'home'
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Load wallpapers from localStorage on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("user-wallpapers") || "[]");
    setWallpapers(saved);
    // If there are wallpapers, select the first one by default or the currently active one
    // For now, just select the first one if available
    if (saved.length > 0) {
      setSelectedId(saved[0].id);
    }
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const newWallpaper = {
        id: Date.now(),
        url: url,
        createdAt: new Date().toISOString()
      };
      
      const updated = [newWallpaper, ...wallpapers];
      setWallpapers(updated);
      setSelectedId(newWallpaper.id);
      localStorage.setItem("user-wallpapers", JSON.stringify(updated));
      
      // Reset input
      e.target.value = null;
    }
  };

  const toggleEditMode = () => {
    setIsEditing(!isEditing);
    setDeleteSelection(new Set());
  };

  const handleWallpaperClick = (id) => {
    if (isEditing) {
      const newSelection = new Set(deleteSelection);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      setDeleteSelection(newSelection);
    } else {
      setSelectedId(id);
    }
  };

  const handleDelete = () => {
    const updated = wallpapers.filter(w => !deleteSelection.has(w.id));
    setWallpapers(updated);
    localStorage.setItem("user-wallpapers", JSON.stringify(updated));
    
    // If selected wallpaper was deleted, reset selection
    if (deleteSelection.has(selectedId)) {
      setSelectedId(updated.length > 0 ? updated[0].id : null);
    }
    
    // Check if we are deleting the active wallpaper
    try {
      const activeJson = localStorage.getItem("active-wallpaper");
      if (activeJson) {
        const active = JSON.parse(activeJson);
        // Find if the active wallpaper is in the deletion set
        // We need to look up the URLs of the deleted items or check IDs
        // Here we can check if the wallpaper with the active URL is being deleted
        const activeWallpaperInList = wallpapers.find(w => w.url === active.url);
        
        if (activeWallpaperInList && deleteSelection.has(activeWallpaperInList.id)) {
          // It's being deleted, clear active settings
          localStorage.removeItem("active-wallpaper");
          // Dispatch events to notify other components immediately
          window.dispatchEvent(new Event("storage"));
          window.dispatchEvent(new Event("component-style-updated"));
        }
      }
    } catch (e) {
      console.error("Failed to check active wallpaper deletion", e);
    }

    // Don't exit edit mode
    setDeleteSelection(new Set());
    setIsDeleteModalOpen(false);
  };

  const [toast, setToast] = useState({ show: false, message: '' });

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ ...toast, show: false }), 2000);
  };

  const handleSave = () => {
    if (!selectedId) return;
    const selectedWallpaper = wallpapers.find(w => w.id === selectedId);
    if (selectedWallpaper) {
      // Save current wallpaper setting
      // This would typically update a global context or another localStorage key for the active theme
      console.log("Applying wallpaper:", selectedWallpaper.url, "Scope:", applyScope);
      localStorage.setItem("active-wallpaper", JSON.stringify({
        url: selectedWallpaper.url,
        scope: applyScope
      }));
      
      const message = applyScope === 'home' ? '已应用到主屏幕' : '已应用到全部';
      showToast(message);
      
      setTimeout(() => {
        navigate(-1);
      }, 1000); // Slight delay to show toast
    }
  };

  const selectedWallpaper = wallpapers.find(w => w.id === selectedId);

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
        <h1 className="text-lg font-bold">设置壁纸</h1>
        <button 
          onClick={toggleEditMode}
          className={`flex h-10 px-4 items-center justify-center rounded-full text-[15px] font-medium transition active:scale-95 ${
            isEditing ? 'bg-black text-white' : 'bg-white text-black shadow-sm'
          }`}
        >
          {isEditing ? '完成' : '编辑'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Preview Area (Top) */}
        <div className="flex-1 flex items-center justify-center p-6 min-h-0">
          <div className="relative aspect-[9/19.5] h-full overflow-hidden rounded-[24px] border-[4px] border-black bg-white shadow-2xl">
            {selectedWallpaper ? (
              <img 
                src={selectedWallpaper.url} 
                alt="Preview" 
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gray-100 text-gray-400">
                <ImageIcon size={48} className="mb-4 opacity-50" />
                <span className="text-sm">未选择壁纸</span>
              </div>
            )}
          </div>
        </div>

        {/* Controls Area (Bottom) */}
        <div className="bg-white rounded-t-[32px] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-10">
          
          {/* Scope Selection */}
          {!isEditing && (
            <div className="px-6 pt-6 pb-4">
              <div className="flex bg-[#F5F5F7] p-1 rounded-2xl">
                <button
                  onClick={() => setApplyScope('all')}
                  className={`flex-1 py-2.5 text-[13px] font-medium rounded-xl transition-all ${
                    applyScope === 'all' 
                      ? 'bg-white text-black shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  应用到全部
                </button>
                <button
                  onClick={() => setApplyScope('home')}
                  className={`flex-1 py-2.5 text-[13px] font-medium rounded-xl transition-all ${
                    applyScope === 'home' 
                      ? 'bg-white text-black shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  只应用到主屏幕
                </button>
              </div>
            </div>
          )}

          {/* Wallpaper List */}
          <div className="px-6 pb-6 pt-4">
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x p-1">
              {/* Upload Button */}
              {!isEditing && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0 snap-start aspect-[9/19.5] w-[calc((100%-48px)/5)] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 transition active:scale-95 hover:bg-gray-100 hover:border-gray-300"
                >
                  <Plus size={20} className="mb-1" />
                  <span className="text-[9px] font-medium">上传</span>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </button>
              )}

              {/* Wallpapers */}
              {wallpapers.map((wp) => {
                const isSelected = selectedId === wp.id;
                const isMarkedForDeletion = deleteSelection.has(wp.id);
                
                return (
                  <button
                    key={wp.id}
                    onClick={() => handleWallpaperClick(wp.id)}
                    className={`relative flex-shrink-0 snap-start aspect-[9/19.5] w-[calc((100%-48px)/5)] overflow-hidden rounded-xl transition-all active:scale-95 ${
                      isEditing 
                        ? (isMarkedForDeletion ? 'ring-2 ring-red-500 opacity-80' : 'opacity-100')
                        : (isSelected ? 'ring-2 ring-black ring-offset-2' : '')
                    }`}
                  >
                    <img 
                      src={wp.url} 
                      alt="Wallpaper" 
                      className="h-full w-full object-cover"
                    />
                    {isEditing && isMarkedForDeletion && (
                      <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
                        <div className="bg-red-500 text-white p-1 rounded-full">
                          <Trash2 size={16} />
                        </div>
                      </div>
                    )}
                    {!isEditing && isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                        <div className="bg-black text-white p-1 rounded-full">
                          <Check size={12} strokeWidth={3} />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Button */}
          <div className="px-6">
            {isEditing ? (
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                disabled={deleteSelection.size === 0}
                className="w-full rounded-full bg-red-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-red-500/20 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                删除选中 ({deleteSelection.size})
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={!selectedId}
                className="w-full rounded-full bg-black py-3.5 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                保存并应用
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="删除壁纸"
        message={`确定要删除选中的 ${deleteSelection.size} 张壁纸吗？`}
        confirmText="删除"
        type="danger"
      />

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
