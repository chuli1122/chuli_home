import React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  onConfirm,
  confirmText = "确定",
  cancelText = "取消",
  isConfirmDisabled = false,
  showButtons = true,
  fullScreen = false,
}) => {
  if (!isOpen) return null;

  if (fullScreen) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex flex-col bg-white">
        {/* Header */}
        <div className="flex items-center px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-gray-100">
          <button onClick={onClose} className="mr-3 rounded-full p-1.5 active:bg-black/5">
            <ChevronLeft size={22} />
          </button>
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
        {showButtons && (
          <div className="border-t border-gray-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-full bg-[#F5F5F5] py-3 text-[15px] font-bold text-gray-500 transition active:scale-95"
            >
              {cancelText}
            </button>
            <button
              onClick={() => !isConfirmDisabled && onConfirm?.()}
              disabled={isConfirmDisabled}
              className="flex-1 rounded-full bg-black py-3 text-[15px] font-bold text-white shadow-lg shadow-black/20 transition active:scale-95 disabled:opacity-50"
            >
              {confirmText}
            </button>
          </div>
        )}
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-8">
      <div
        className="w-full max-w-[320px] rounded-[24px] bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Title row with optional back button */}
        {title && (
          <div className="mb-6 flex items-center justify-center relative">
            {!showButtons && (
              <button onClick={onClose} className="absolute left-0 rounded-full p-1 active:bg-black/5">
                <ChevronLeft size={20} />
              </button>
            )}
            <h3 className="text-[17px] font-bold text-black">{title}</h3>
          </div>
        )}

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
              onClick={() => !isConfirmDisabled && onConfirm?.()}
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
