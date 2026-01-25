import React from "react";
import Modal from "./Modal";

const ConfirmModal = ({ isOpen, onClose, onConfirm, title = "确认", message, confirmText = "确定", cancelText = "取消" }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      onConfirm={onConfirm}
      confirmText={confirmText}
      cancelText={cancelText}
    >
      <div className="text-center text-[15px] text-gray-700 mb-2 px-2">
        {message}
      </div>
    </Modal>
  );
};

export default ConfirmModal;
