import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Trash2, Calendar as CalendarIcon, Pin, PinOff, GripVertical, Edit2 } from "lucide-react";
import { Reorder } from "framer-motion";

const CountdownPage = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ title: "", date: "", repeatType: "none" }); // repeatType: 'none' | 'monthly' | 'yearly'

  useEffect(() => {
    const savedEvents = JSON.parse(localStorage.getItem("countdown-events") || "[]");
    if (savedEvents.length === 0) {
      const defaultEvents = [
        { id: 1, title: "恋爱纪念日", date: "2025-05-20", isPinned: true, repeatType: "yearly" },
        { id: 2, title: "我的生日", date: "2025-11-11", isPinned: false, repeatType: "yearly" },
        { id: 3, title: "新年", date: "2026-01-01", isPinned: false, repeatType: "yearly" },
      ];
      setEvents(defaultEvents);
      localStorage.setItem("countdown-events", JSON.stringify(defaultEvents));
    } else {
      setEvents(savedEvents);
    }
  }, []);

  const saveEvents = (newEvents) => {
    setEvents(newEvents);
    localStorage.setItem("countdown-events", JSON.stringify(newEvents));
  };

  const handleSave = () => {
    if (!eventForm.title || !eventForm.date) return;
    
    if (editingEvent) {
      // Edit existing
      const updatedEvents = events.map(ev => 
        ev.id === editingEvent.id 
          ? { ...ev, ...eventForm }
          : ev
      );
      saveEvents(updatedEvents);
    } else {
      // Add new
      const event = {
        id: Date.now(),
        title: eventForm.title,
        date: eventForm.date,
        repeatType: eventForm.repeatType,
        isPinned: false
      };
      // Add to beginning
      const updatedEvents = [event, ...events];
      saveEvents(updatedEvents);
    }
    
    closeModal();
  };

  const openAddModal = () => {
    setEditingEvent(null);
    setEventForm({ title: "", date: "", repeatType: "none" });
    setIsModalOpen(true);
  };

  const openEditModal = (event, e) => {
    e.stopPropagation();
    setEditingEvent(event);
    setEventForm({ 
      title: event.title, 
      date: event.date,
      repeatType: event.repeatType || "none"
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEvent(null);
    setEventForm({ title: "", date: "", repeatType: "none" });
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    const updatedEvents = events.filter(ev => ev.id !== id);
    saveEvents(updatedEvents);
  };

  const handlePin = (id, e) => {
    e.stopPropagation();
    const eventIndex = events.findIndex(ev => ev.id === id);
    if (eventIndex === -1) return;
    
    const event = events[eventIndex];
    const isPinned = !event.isPinned;
    
    let newEvents = [...events];
    newEvents.splice(eventIndex, 1); // Remove from current position
    
    if (isPinned) {
      // Find last pinned index
      const lastPinnedIndex = newEvents.findLastIndex(e => e.isPinned);
      // Insert after last pinned (or at 0 if none)
      newEvents.splice(lastPinnedIndex + 1, 0, { ...event, isPinned: true });
    } else {
      // Unpin: insert after all pinned events
      const lastPinnedIndex = newEvents.findLastIndex(e => e.isPinned);
      newEvents.splice(lastPinnedIndex + 1, 0, { ...event, isPinned: false });
    }
    
    saveEvents(newEvents);
  };

  const getDaysLeft = (dateString, repeatType = 'none') => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let target = new Date(dateString);
    target.setHours(0, 0, 0, 0);

    if (repeatType === 'monthly') {
      // Set to current month
      target.setFullYear(today.getFullYear());
      target.setMonth(today.getMonth());
      
      // If day has passed in current month, move to next month
      if (target < today) {
        target.setMonth(target.getMonth() + 1);
      }
    } else if (repeatType === 'yearly') {
      // Set to current year
      target.setFullYear(today.getFullYear());
      
      // If date has passed in current year, move to next year
      if (target < today) {
        target.setFullYear(target.getFullYear() + 1);
      }
    }
    
    const diff = target.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

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
        <h1 className="text-lg font-bold">倒数日</h1>
        <button 
          onClick={openAddModal}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white shadow-lg shadow-black/20 active:scale-95 transition"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 pb-24">
        {events.length === 0 ? (
          <div className="mt-20 flex flex-col items-center justify-center text-gray-400">
            <CalendarIcon size={48} className="mb-4 opacity-50" />
            <p>还没有倒数日</p>
            <p className="text-sm">点击右上角添加</p>
          </div>
        ) : (
          <Reorder.Group axis="y" values={events} onReorder={saveEvents} className="flex flex-col gap-4">
            {events.map((event) => {
              const days = getDaysLeft(event.date, event.repeatType);
              const isPast = days < 0;
              
              return (
                <Reorder.Item 
                  key={event.id} 
                  value={event}
                  className="relative flex items-center justify-between overflow-hidden rounded-[24px] bg-white p-6 shadow-sm active:shadow-md"
                  whileDrag={{ scale: 1.02, zIndex: 10 }}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="text-gray-300 cursor-grab active:cursor-grabbing" size={20} />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-medium text-gray-700">
                          {event.title}
                        </span>
                        {event.isPinned && <Pin size={12} className="text-blue-500 fill-blue-500" />}
                      </div>
                      <span className="text-xs text-gray-700">{event.date}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-end gap-1">
                      {!isPast && <span className="text-xs font-medium text-gray-700 mr-0.5 mb-1">还有</span>}
                      <span className="text-3xl font-bold text-gray-700 leading-none">
                        {Math.abs(days)}
                      </span>
                      <span className="text-xs font-medium text-gray-700 mb-1">
                        {isPast ? '天前' : '天'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <button
                        onClick={(e) => handlePin(event.id, e)}
                        className={`p-2 transition-colors ${event.isPinned ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500'}`}
                      >
                        {event.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                      </button>
                      <button
                        onClick={(e) => openEditModal(event, e)}
                        className="p-2 text-gray-300 hover:text-blue-500 transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(event.id, e)}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-8" onClick={closeModal}>
          <div 
            className="w-full max-w-[320px] rounded-[24px] bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-6 text-center text-[17px] font-bold">
              {editingEvent ? '编辑倒数日' : '添加倒数日'}
            </h3>
            
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="事件名称 (如: 恋爱纪念日)"
                value={eventForm.title}
                onChange={e => setEventForm({...eventForm, title: e.target.value})}
                className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500 ml-1">目标日期</label>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={e => setEventForm({...eventForm, date: e.target.value})}
                  className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-gray-500 ml-1">重复</label>
                <div className="flex gap-2">
                  {[
                    { id: 'none', label: '不重复' },
                    { id: 'monthly', label: '每月' },
                    { id: 'yearly', label: '每年' }
                  ].map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setEventForm({ ...eventForm, repeatType: type.id })}
                      className={`flex-1 rounded-xl py-2.5 text-[13px] font-medium transition-all ${
                        eventForm.repeatType === type.id
                          ? 'bg-black text-white shadow-md shadow-black/10'
                          : 'bg-[#F5F5F5] text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 rounded-full bg-[#F5F5F5] py-3 text-[15px] font-bold text-gray-500 transition active:scale-95"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!eventForm.title || !eventForm.date}
                className="flex-1 rounded-full bg-black py-3 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                {editingEvent ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CountdownPage;
