import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { LobbyView, MatchOptions, ShotCommand } from "../../billiard/_components/billiard-game/match-types";
import type { HallMotion, HallView } from "./hall-types";
import type { LobbyAction } from "./type";

type LobbyResponse = LobbyView & { hall?: HallView };

export const readLobby = async (
  action?: LobbyAction, { id, hall, searching }: { id?: string; hall?: boolean; searching?: boolean } = {},
): Promise<LobbyResponse> => {
  const query = new URLSearchParams();
  if (id) query.set("match", id);
  if (hall) query.set("hall", "1");
  if (searching) query.set("search", "1");
  const signal = AbortSignal.timeout(8000);
  const response = await fetch(`/api/billiard?${query}`, action ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
    signal,
  } : { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không thể kết nối đến sảnh.");
  return data;
};

export const messageOf = (error: unknown) => error instanceof Error ? error.message : "Không thể kết nối đến sảnh.";

export const useLobby = () => {
  const [view, setView] = useState<LobbyResponse>();
  const [options, setOptions] = useState<MatchOptions>({ rule: "nine" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const running = useRef(false);
  const polling = useRef(false);
  const revision = useRef(0);
  const moving = useRef(false);
  const [motionError, setMotionError] = useState("");

  const publishMotion = async (motion: HallMotion) => {
    if (moving.current || !view?.player || open || (view.match && !view.match.result)) return;
    moving.current = true;
    try {
      const response = await fetch("/api/billiard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "motion", motion }), signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Không thể đồng bộ vị trí. Đang thử kết nối lại…");
      setMotionError("");
    } catch {
      setMotionError("Không thể đồng bộ vị trí. Hãy kiểm tra kết nối mạng.");
    } finally { moving.current = false; }
  };

  const send = async (action: LobbyAction, enter = false) => {
    if (running.current) return;
    running.current = true;
    revision.current += 1;
    setBusy(true);
    setError("");
    try {
      const result = await readLobby(action, { hall: !open && !enter });
      setView(result);
      if (result.match && (enter || (view && !result.match.result && result.match.id !== view.match?.id))) setOpen(true);
      return result;
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const refresh = useEffectEvent(async () => {
    if (running.current || polling.current) return;
    polling.current = true;
    const current = ++revision.current;
    const queue = !open && view?.queued;
    try {
      const next = await readLobby(undefined, { id: open ? view?.match?.id : undefined, hall: !open, searching: Boolean(queue) });
      if (current !== revision.current) return;
      if (view && next.match && !next.match.result && next.match.id !== view.match?.id) setOpen(true);
      if (!view) setError("");
      setView(next);
    } catch (caught) {
      if (!view && revision.current === current) setError(messageOf(caught));
    } finally {
      polling.current = false;
    }
  });

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 750);
    return () => {
      revision.current += 1;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const deadline = open ? view?.match?.deadline : null;
  useEffect(() => {
    const update = () => setSeconds(deadline == null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [deadline]);

  const match = view?.match;
  const manage = async (action: "resign" | "timeout" | "pass") => {
    if (match) await send({ type: "manage", action, id: match.id, version: match.version });
  };

  return {
    view, options, setOptions, busy, error, motionError, publishMotion, open, seconds, manage, send,
    onBack: () => {
      revision.current += 1;
      setOpen(false);
      setError("");
    },
    resume: () => {
      revision.current += 1;
      setError("");
      setOpen(true);
    },
    play: async (shot: ShotCommand) => {
      if (match) await send({ type: "shot", id: match.id, version: match.version, shot });
    },
    computer: () => {
      if (match) void send({ type: "computer", id: match.id, version: match.version });
    },
  };
};
