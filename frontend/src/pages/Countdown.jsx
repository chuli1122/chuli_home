import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Trash2, Calendar as CalendarIcon, Pin, PinOff, GripVertical, Edit2 } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import ConfirmModal from "../components/ConfirmModal";

const CatPinIcon = ({ size = 24, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 1304 1024" 
    fill="none" 
    className={className} 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M82.59529938 450.3801144a150.60833431 128.0248712 90 1 0 256.0497433 4e-8 150.60833431 128.0248712 90 1 0-256.0497433-4e-8Z" fill="#2c2c2c" />
    <path d="M1074.58733465 734.21008403a123.50817892 150.6083343 12.07 1 0 62.98638385-294.55762892 123.50817892 150.6083343 12.07 1 0-62.98638385 294.55762892Z" fill="#2c2c2c" />
    <path d="M393.39047088 225.47997485a168.1299859 131.60707559 90 1 0 263.21415207 2e-8 168.1299859 131.60707559 90 1 0-263.21415207-2e-8Z" fill="#2c2c2c" />
    <path d="M864.14609382 436.84087636a131.60707559 168.1299859 6.71 1 0 39.28998639-333.95668374 131.60707559 168.1299859 6.71 1 0-39.28998639 333.95668373Z" fill="#2c2c2c" />
    <path d="M929.47515147 749.26056245c-9.42275492 142.66518562-147.18187788 219.21533615-310.17217958 208.39084944s-289.53556667-104.6626682-280.34643328-247.40572826 152.55518447-233.23265776 312.19690332-238.91746033c165.09289985 33.1743283 287.74446448 135.18927998 278.32170954 277.93233915z" fill="#2c2c2c" />
  </svg>
);

const CountdownItem = ({ event, handlePin, openEditModal, handleDelete }) => {
  const dragControls = useDragControls();

  const getDaysLeft = (dateString, repeatType = 'none') => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let target = new Date(dateString);
    target.setHours(0, 0, 0, 0);

    if (repeatType === 'monthly') {
      target.setFullYear(today.getFullYear());
      target.setMonth(today.getMonth());
      if (target < today) {
        target.setMonth(target.getMonth() + 1);
      }
    } else if (repeatType === 'yearly') {
      target.setFullYear(today.getFullYear());
      if (target < today) {
        target.setFullYear(target.getFullYear() + 1);
      }
    }
    
    const diff = target.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const days = getDaysLeft(event.date, event.repeatType);
  const isPast = days < 0;

  return (
    <Reorder.Item 
      value={event}
      dragListener={false}
      dragControls={dragControls}
      className="relative flex items-center justify-between overflow-hidden rounded-[24px] bg-white p-6 shadow-sm active:shadow-md touch-manipulation"
      whileDrag={{ scale: 1.02, zIndex: 10 }}
    >
      {event.isPinned && (
        <div className="absolute left-3 top-0 z-20">
          <CatPinIcon size={48} className="text-black -rotate-12" />
        </div>
      )}

      <div className="flex items-center gap-3">
        <div 
          className="touch-none cursor-grab active:cursor-grabbing p-2 -ml-2"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical className="text-gray-300" size={20} />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-black">
              {event.title}
            </span>
          </div>
          <span className="text-xs text-black">{event.date}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-end gap-1">
          {!isPast && <span className="text-xs font-medium text-black mr-0.5 mb-1">还有</span>}
          <span className="text-3xl font-bold text-black leading-none">
            {Math.abs(days)}
          </span>
          <span className="text-xs font-medium text-black mb-1">
            {isPast ? '天前' : '天'}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={(e) => handlePin(event.id, e)}
            className={`p-2 transition-colors active:scale-90 ${event.isPinned ? 'text-black' : 'text-gray-300'}`}
          >
            {event.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
          <button
            onClick={(e) => openEditModal(event, e)}
            className="p-2 text-gray-300 active:text-black transition-colors active:scale-90"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={(e) => handleDelete(event.id, e)}
            className="p-2 text-gray-300 active:text-red-500 transition-colors active:scale-90"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
};

const CountdownPage = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ title: "", date: "", repeatType: "none" });
  const [deleteState, setDeleteState] = useState({ isOpen: false, event: null });

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

  const handleReorderPinned = (newPinned) => {
    const unpinned = events.filter(e => !e.isPinned);
    const newEvents = [...newPinned, ...unpinned];
    saveEvents(newEvents);
  };

  const handleReorderUnpinned = (newUnpinned) => {
    const pinned = events.filter(e => e.isPinned);
    const newEvents = [...pinned, ...newUnpinned];
    saveEvents(newEvents);
  };

  const handleSave = () => {
    if (!eventForm.title || !eventForm.date) return;
    
    if (editingEvent) {
      const updatedEvents = events.map(ev => 
        ev.id === editingEvent.id 
          ? { ...ev, ...eventForm }
          : ev
      );
      saveEvents(updatedEvents);
    } else {
      const event = {
        id: Date.now(),
        title: eventForm.title,
        date: eventForm.date,
        repeatType: eventForm.repeatType,
        isPinned: false
      };
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
    const event = events.find(ev => ev.id === id);
    setDeleteState({ isOpen: true, event });
  };

  const confirmDelete = () => {
    if (deleteState.event) {
      const updatedEvents = events.filter(ev => ev.id !== deleteState.event.id);
      saveEvents(updatedEvents);
      setDeleteState({ isOpen: false, event: null });
    }
  };

  const handlePin = (id, e) => {
    e.stopPropagation();
    const eventIndex = events.findIndex(ev => ev.id === id);
    if (eventIndex === -1) return;
    
    const event = events[eventIndex];
    const isPinned = !event.isPinned;
    
    let newEvents = [...events];
    newEvents.splice(eventIndex, 1); 
    
    if (isPinned) {
      const lastPinnedIndex = newEvents.findLastIndex(e => e.isPinned);
      newEvents.splice(lastPinnedIndex + 1, 0, { ...event, isPinned: true });
    } else {
      const lastPinnedIndex = newEvents.findLastIndex(e => e.isPinned);
      newEvents.splice(lastPinnedIndex + 1, 0, { ...event, isPinned: false });
    }
    
    saveEvents(newEvents);
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
          <div className="flex flex-col gap-4">
            {/* Pinned Group */}
            {events.some(e => e.isPinned) && (
              <Reorder.Group 
                axis="y" 
                values={events.filter(e => e.isPinned)} 
                onReorder={handleReorderPinned} 
                className="flex flex-col gap-4"
              >
                {events.filter(e => e.isPinned).map((event) => (
                  <CountdownItem 
                    key={event.id} 
                    event={event} 
                    handlePin={handlePin}
                    openEditModal={openEditModal}
                    handleDelete={handleDelete}
                  />
                ))}
              </Reorder.Group>
            )}

            {/* Unpinned Group */}
            <Reorder.Group 
              axis="y" 
              values={events.filter(e => !e.isPinned)} 
              onReorder={handleReorderUnpinned} 
              className="flex flex-col gap-4"
            >
              {events.filter(e => !e.isPinned).map((event) => (
                <CountdownItem 
                  key={event.id} 
                  event={event} 
                  handlePin={handlePin}
                  openEditModal={openEditModal}
                  handleDelete={handleDelete}
                />
              ))}
            </Reorder.Group>
          </div>
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

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteState.isOpen}
        onClose={() => setDeleteState({ isOpen: false, event: null })}
        onConfirm={confirmDelete}
        title="删除提醒"
        message={deleteState.event ? `确定要删除“${deleteState.event.title}”吗？` : ""}
      />
    </div>
  );
};

export default CountdownPage;
