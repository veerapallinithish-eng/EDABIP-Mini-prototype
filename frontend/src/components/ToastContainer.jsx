export default function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.type}`} key={toast.id} role="status">
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
