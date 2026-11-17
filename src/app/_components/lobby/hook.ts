import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { LobbyView, MatchOptions, ShotCommand } from "../../billiard/_components/billiard-game/match-types";
import type { LobbyAction } from "./type";

const readLobby = async (id?: string, action?: LobbyAction, searching = false): Promise<LobbyView> => {
  const query = id ? `?match=${encodeURIComponent(id)}` : searching ? "?search=1" : "";
  const signal = AbortSignal.timeout(8000);
  const response = await fetch(`/api/billiard${query}`, action ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
    signal,
  } : { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không thể kết nối đến sảnh.");
  return data;
};

const messageOf = (error: unknown) => error instanceof Error ? error.message : "Không thể kết nối đến sảnh.";

export const useLobby = () => {
  const [view, setView] = useState<LobbyView>();
  const [name, setName] = useState("");
  const [options, setOptions] = useState<MatchOptions>({ rule: "nine", table: "mr-sung" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const running = useRef(false);
  const polling = useRef(false);
  const revision = useRef(0);

  const send = async (action: LobbyAction, enter = false) => {
    if (running.current) return;
    running.current = true;
    revision.current += 1;
    setBusy(true);
    setError("");
    try {
      const result = await readLobby(undefined, action);
      setView(result);
      if (enter && result.match) setOpen(true);
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
      const next = await readLobby(open ? view?.match?.id : undefined, undefined, Boolean(queue));
      if (current !== revision.current) return;
      if (!view?.player && next.player) setName(next.player.name);
      if (queue && next.match) setOpen(true);
      setView(next);
    } catch (caught) {
      if (!view && revision.current === current) setError(messageOf(caught));
    } finally {
      polling.current = false;
    }
  });

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 1450);
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
  const manage = (action: "resign" | "timeout" | "pass") => match
    ? send({ type: "manage", action, id: match.id, version: match.version }) : Promise.resolve();

  return {
    view, name, setName, options, setOptions, busy, error, open, seconds, manage, send,
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
    play: (shot: ShotCommand) => match ? send({ type: "shot", id: match.id, version: match.version, shot }) : Promise.resolve(),
    computer: () => {
      if (match) void send({ type: "computer", id: match.id, version: match.version });
    },
  };
};
