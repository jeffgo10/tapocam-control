"use client";

type StreamPlayerProps = {
  src: string | null;
  title: string;
  detail: string;
  emptyLabel: string;
  error?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  onRetry?: () => void;
  castDevice?: string | null;
};

export function playbackUrl(streamUrl: string): string {
  const url = new URL(streamUrl);
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    url.hostname = host;
  }
  return url.toString();
}

export function StreamPlayer({
  src,
  title,
  detail,
  emptyLabel,
  error,
  selected = false,
  onSelect,
  onRetry,
  castDevice = null,
}: StreamPlayerProps) {
  const suspended = castDevice !== null;
  const frameSrc = src && !suspended ? playbackUrl(src) : null;

  return (
    <section
      className={`overflow-hidden rounded-3xl border bg-black ${
        selected ? "border-accent" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 text-left"
          disabled={!onSelect}
        >
          <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
          <p className="truncate font-mono text-xs text-muted">{detail}</p>
        </button>
        <span className="inline-flex shrink-0 items-center gap-2 text-xs text-muted">
          <span
            className={`size-2 rounded-full ${suspended || src ? "bg-live" : "bg-line"}`}
            aria-hidden
          />
          {suspended ? "On display" : selected ? "Controls" : src ? "WebRTC" : "Idle"}
        </span>
      </div>
      <div className="relative aspect-video bg-black">
        {frameSrc ? (
          <iframe
            key={frameSrc}
            title={`${title} live view`}
            src={frameSrc}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center gap-3 px-6 text-center text-sm text-muted">
            <p>{suspended ? `Playing in ${castDevice}` : error || emptyLabel}</p>
            {error && onRetry && !suspended ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground"
              >
                Retry
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
