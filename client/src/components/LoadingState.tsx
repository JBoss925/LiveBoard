type LoadingStateProps = {
  title: string;
  message?: string;
  fullScreen?: boolean;
};

export function LoadingState({ title, message, fullScreen = false }: LoadingStateProps) {
  const className = fullScreen ? "loading-state loading-state-full" : "loading-state";

  return (
    <div className={className} role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {message ? <p>{message}</p> : null}
      </div>
    </div>
  );
}
