"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "@/components/api";

type Segment = { name: string; start: number; end: number };

type DayResponse = { day: string; segments: Segment[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SPEEDS = [1, 2, 4, 8] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Speed = (typeof SPEEDS)[number];

type RecordingPlaybackProps = {
  cameraId: string;
  cameraName: string;
  onClose: () => void;
};

export function RecordingPlayback({ cameraId, cameraName, onClose }: RecordingPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const segmentsRef = useRef<Segment[]>([]);
  const playheadRef = useRef(0);
  const scrubbing = useRef(false);
  const advancing = useRef<string | null>(null);
  const clipRef = useRef<string | null>(null);
  const readyClip = useRef<string | null>(null);
  const offsetRef = useRef(0);
  const speedRef = useRef<Speed>(1);
  const grabRef = useRef<{ x: number; playhead: number; moved: boolean } | null>(null);
  const [day, setDay] = useState(dayKey(new Date()));
  const [segments, setSegments] = useState<Segment[]>([]);
  const [playhead, setPlayhead] = useState(dayStartMs(dayKey(new Date())));
  const [span, setSpan] = useState(4 * HOUR_MS);
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  const origin = dayStartMs(day);
  const view = viewStart(playhead, span, origin);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function showAt(ms: number, autoplay: boolean, user = true) {
    showClip({
      video: videoRef.current,
      cameraId,
      origin,
      segments: segmentsRef.current,
      ms,
      autoplay,
      user,
      playheadRef,
      advancing,
      clipRef,
      readyClip,
      offsetRef,
      speed: speedRef.current,
      setPlayhead,
      setPaused,
    });
  }

  useEffect(() => {
    let cancelled = false;
    void requestJson<DayResponse>(`/api/recordings/${cameraId}?day=${day}`)
      .then((data) => {
        if (cancelled) return;
        segmentsRef.current = data.segments;
        setSegments(data.segments);
        setEmpty(data.segments.length === 0);
        setError(null);
        showClip({
          video: videoRef.current,
          cameraId,
          origin,
          segments: data.segments,
          ms: openingTime(origin, data.segments, Date.now()),
          autoplay: false,
          user: true,
          playheadRef,
          advancing,
          clipRef,
          readyClip,
          offsetRef,
          speed: speedRef.current,
          setPlayhead,
          setPaused,
        });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        segmentsRef.current = [];
        setSegments([]);
        setEmpty(true);
        setError(loadError instanceof Error ? loadError.message : "Could not load recordings.");
      });
    return () => {
      cancelled = true;
    };
  }, [cameraId, day, origin]);

  useEffect(() => {
    if (day !== dayKey(new Date())) return;
    const timer = setInterval(() => {
      void requestJson<DayResponse>(`/api/recordings/${cameraId}?day=${day}`)
        .then((data) => {
          segmentsRef.current = data.segments;
          setSegments(data.segments);
          setEmpty(data.segments.length === 0);
        })
        .catch(() => undefined);
    }, 20_000);
    return () => clearInterval(timer);
  }, [cameraId, day]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      setSpan((current) => {
        const next = event.deltaY > 0 ? current * 1.25 : current / 1.25;
        return Math.min(DAY_MS, Math.max(HOUR_MS, next));
      });
    };
    track.addEventListener("wheel", zoom, { passive: false });
    return () => track.removeEventListener("wheel", zoom);
  }, []);

  function onLoaded() {
    const video = videoRef.current;
    if (!video) return;
    readyClip.current = clipRef.current;
    video.playbackRate = speedRef.current;
    if (Math.abs(video.currentTime - offsetRef.current) > 0.2) {
      video.currentTime = offsetRef.current;
    }
  }

  function chooseSpeed(next: Speed) {
    speedRef.current = next;
    setSpeed(next);
    const video = videoRef.current;
    if (video) video.playbackRate = next;
  }

  function onTime() {
    if (scrubbing.current) return;
    const video = videoRef.current;
    const name = clipRef.current;
    if (!video || !name || readyClip.current !== name) return;
    const segment = segmentsRef.current.find((item) => item.name === name);
    if (!segment) return;
    const ms = segment.start + video.currentTime * 1000;
    playheadRef.current = ms;
    setPlayhead(ms);
    const length = (segment.end - segment.start) / 1000;
    const limit = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : length;
    const lead = Math.max(0.3, (video.playbackRate || 1) * 0.25);
    if (!video.ended && (video.paused || video.currentTime < limit - lead)) return;
    if (advancing.current === name) return;
    advancing.current = name;
    const index = segmentsRef.current.findIndex((item) => item.name === name);
    const next = segmentsRef.current[index + 1];
    if (next) showAt(next.start, true, false);
    else video.pause();
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video || segmentsRef.current.length === 0) return;
    if (video.paused) showAt(playheadRef.current, true);
    else {
      video.pause();
      setPaused(true);
    }
  }

  function timeAt(clientX: number, fromPlayhead: number): number {
    const track = trackRef.current;
    if (!track) return fromPlayhead;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    return viewStart(fromPlayhead, span, origin) + ratio * span;
  }

  const hours = hourMarks(view, view + span);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Playback for ${cameraName}`}
        className="max-h-full w-full max-w-4xl overflow-hidden rounded-3xl border border-line bg-panel"
        onClick={(event) => event.stopPropagation()}
      >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-accent uppercase">Playback</p>
          <h2 className="text-sm font-medium">{cameraName}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-3 py-1 text-sm text-muted"
        >
          Close
        </button>
      </div>
      <div className="relative bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full bg-black"
          playsInline
          onLoadedMetadata={onLoaded}
          onTimeUpdate={onTime}
          onEnded={onTime}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onClick={togglePlay}
        />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-full bg-black/70 px-3 py-1 text-sm text-white"
          >
            {paused ? "Play" : "Pause"}
          </button>
          <div role="group" aria-label="Playback speed" className="flex overflow-hidden rounded-full bg-black/70 text-sm">
            {SPEEDS.map((value) => {
              const selected = speed === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseSpeed(value)}
                  className={`px-2.5 py-1 ${selected ? "bg-white text-black" : "text-white"}`}
                >
                  {value}x
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="grid gap-3 px-4 py-4">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-4">
          <button type="button" aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))} className="text-lg text-muted">
            ‹
          </button>
          <p className="min-w-36 text-center text-sm font-medium">{labelDay(day)}</p>
          <button type="button" aria-label="Next day" onClick={() => setDay(shiftDay(day, 1))} className="text-lg text-muted">
            ›
          </button>
        </div>
        {empty && !error ? <p className="text-center text-sm text-muted">No recordings for this day.</p> : null}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Recording timeline"
          aria-valuemin={0}
          aria-valuemax={DAY_MS}
          aria-valuenow={Math.max(0, playhead - origin)}
          aria-valuetext={labelClock(playhead)}
          className="relative h-28 cursor-ew-resize touch-none select-none"
          onPointerDown={(event) => {
            scrubbing.current = true;
            grabRef.current = { x: event.clientX, playhead: playheadRef.current, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const grab = grabRef.current;
            const track = trackRef.current;
            if (!scrubbing.current || !grab || !track) return;
            const dx = event.clientX - grab.x;
            if (Math.abs(dx) > 3) grab.moved = true;
            const width = track.getBoundingClientRect().width || 1;
            showAt(grab.playhead - (dx / width) * span, !videoRef.current?.paused);
          }}
          onPointerUp={(event) => {
            const grab = grabRef.current;
            if (grab && !grab.moved) showAt(timeAt(event.clientX, grab.playhead), !videoRef.current?.paused);
            grabRef.current = null;
            scrubbing.current = false;
          }}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" ? 15_000 : event.key === "ArrowLeft" ? -15_000 : 0;
            if (step === 0) return;
            event.preventDefault();
            showAt(playheadRef.current + step, videoRef.current ? !videoRef.current.paused : false);
          }}
        >
          <div
            className="absolute -translate-x-1/2 rounded-md bg-white px-2 py-1 text-xs font-medium text-black"
            style={{ left: `${percent(playhead, view, span)}%`, top: 0 }}
          >
            {labelClock(playhead)}
          </div>
          {hours.map((mark) => (
            <span
              key={mark}
              className="absolute top-8 -translate-x-1/2 text-[11px] text-muted"
              style={{ left: `${percent(mark, view, span)}%` }}
            >
              {labelHour(mark)}
            </span>
          ))}
          <div className="absolute inset-x-0 bottom-0 h-10 overflow-hidden rounded-md bg-black">
            {segments.map((segment) => {
              const left = percent(Math.max(segment.start, view), view, span);
              const right = percent(Math.min(segment.end, view + span), view, span);
              if (right <= 0 || left >= 100) return null;
              return (
                <span
                  key={segment.name}
                  className="absolute top-1 bottom-1 rounded-sm bg-accent"
                  style={{ left: `${left}%`, width: `${Math.max(right - left, 0.35)}%` }}
                />
              );
            })}
            <span
              className="absolute top-0 bottom-0 w-0.5 bg-white"
              style={{ left: `${percent(playhead, view, span)}%` }}
            />
          </div>
        </div>
      </div>
      </section>
    </div>
  );
}

function showClip(input: {
  video: HTMLVideoElement | null;
  cameraId: string;
  origin: number;
  segments: Segment[];
  ms: number;
  autoplay: boolean;
  user: boolean;
  playheadRef: { current: number };
  advancing: { current: string | null };
  clipRef: { current: string | null };
  readyClip: { current: string | null };
  offsetRef: { current: number };
  speed: number;
  setPlayhead: (value: number) => void;
  setPaused: (value: boolean) => void;
}) {
  if (input.user) input.advancing.current = null;
  const located = locate(input.segments, clampDay(input.ms, input.origin));
  if (!located) {
    input.playheadRef.current = clampDay(input.ms, input.origin);
    input.setPlayhead(input.playheadRef.current);
    if (input.video) {
      input.video.pause();
      input.video.removeAttribute("src");
      input.video.load();
      input.clipRef.current = null;
      input.readyClip.current = null;
      input.setPaused(true);
    }
    return;
  }
  const at = located.segment.start + located.offset * 1000;
  input.playheadRef.current = at;
  input.setPlayhead(at);
  if (!input.video) return;
  const url = `/api/recordings/${input.cameraId}/media?name=${encodeURIComponent(located.segment.name)}`;
  input.offsetRef.current = located.offset;
  if (input.clipRef.current !== located.segment.name) {
    input.readyClip.current = null;
    input.clipRef.current = located.segment.name;
    input.video.src = url;
  } else if (Math.abs(input.video.currentTime - located.offset) > 0.35) {
    input.video.currentTime = located.offset;
  }
  input.video.playbackRate = input.speed;
  if (input.autoplay) {
    void input.video.play().then(
      () => input.setPaused(false),
      () => input.setPaused(true),
    );
  }
}

function locate(segments: Segment[], ms: number): { segment: Segment; offset: number } | null {
  const inside = segments.find((segment) => ms >= segment.start && ms < segment.end);
  if (inside) return { segment: inside, offset: (ms - inside.start) / 1000 };
  const upcoming = segments.find((segment) => segment.start >= ms);
  if (upcoming) return { segment: upcoming, offset: 0 };
  const last = segments[segments.length - 1];
  if (!last) return null;
  const length = Math.max(0, (last.end - last.start) / 1000 - 0.05);
  return { segment: last, offset: length };
}

function openingTime(origin: number, segments: Segment[], now: number): number {
  if (segments.length === 0) return origin;
  const live = segments.find((segment) => segment.start <= now && now < segment.end);
  if (live) return Math.max(live.start, now - 2_000);
  if (now >= origin && now < origin + DAY_MS) return segments[segments.length - 1].start;
  return segments[0].start;
}

function clampDay(ms: number, origin: number): number {
  return Math.min(origin + DAY_MS - 1, Math.max(origin, ms));
}

function viewStart(playhead: number, span: number, origin: number): number {
  const end = origin + DAY_MS;
  return Math.min(Math.max(playhead - span / 2, origin), Math.max(origin, end - span));
}

function hourMarks(start: number, end: number): number[] {
  const marks: number[] = [];
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  let cursor = first.getTime();
  if (cursor < start) cursor += HOUR_MS;
  for (; cursor <= end; cursor += HOUR_MS) marks.push(cursor);
  return marks;
}

function percent(ms: number, view: number, span: number): number {
  return ((ms - view) / span) * 100;
}

function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayStartMs(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).getTime();
}

function shiftDay(day: string, delta: number): string {
  return dayKey(new Date(dayStartMs(day) + delta * DAY_MS));
}

function labelDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${MONTHS[month - 1]} ${date}, ${year}`;
}

function labelClock(ms: number): string {
  const date = new Date(ms);
  const suffix = date.getHours() >= 12 ? "PM" : "AM";
  const hour = date.getHours() % 12 || 12;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${hour}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${suffix}`;
}

function labelHour(ms: number): string {
  const date = new Date(ms);
  const suffix = date.getHours() >= 12 ? "PM" : "AM";
  const hour = date.getHours() % 12 || 12;
  return `${hour}:00 ${suffix}`;
}
