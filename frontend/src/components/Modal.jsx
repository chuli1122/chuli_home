import React from "react";
import { createPortal } from "react-dom";

const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  onConfirm, 
  confirmText = "确定", 
  cancelText = "取消",
  isConfirmDisabled = false,
  showButtons = true
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-8" onClick={onClose}>
      <div 
        className="w-full max-w-[320px] rounded-[24px] bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={e => e.stopPropagation()}
      >
        {title && <h3 className="mb-6 text-center text-[17px] font-bold text-black">{title}</h3>}
        
        <div className="relative">
          {children}
        </div>

        {showButtons && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-full bg-[#F5F5F5] py-3 text-[15px] font-bold text-gray-500 transition active:scale-95"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                if (!isConfirmDisabled && onConfirm) {
                  onConfirm();
                }
              }}
              disabled={isConfirmDisabled}
              className="flex-1 rounded-full bg-black py-3 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
