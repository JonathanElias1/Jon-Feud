import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Family Feud — JSON + Sudden Death + Steal (fixed)
 *
 * Keys:
 *  Q / P  -> Faceoff buzz (Team A / Team B) — first wins, lockout others
 *  X      -> Faceoff/Sudden: pass turn (wrong); Round: add strike
 *  1..8   -> Reveal / hide answer tiles
 *  A / L  -> Award bank to Team A / Team B (applies round multiplier)
 *  N      -> Next round (auto Sudden Death if tied after last round)
 *  R      -> Restart game
 *  F      -> Fullscreen
 *  D / B  -> Play ding / buzzer (manual helpers)
 */

const BRAND_A = "#0ea5e9";
const BRAND_B = "#22c55e";
const gradientBg = { background: `linear-gradient(135deg, ${BRAND_A}, ${BRAND_B})` };

const cls = (...xs) => xs.filter(Boolean).join(" ");

// --------- Fallback data if rounds.json can't be loaded ----------
const FALLBACK = {
  rounds: [
    {
      question: "Name something you bring to a birthday party:",
      answers: [
        { text: "Gift", points: 35 },
        { text: "Cake", points: 26 },
        { text: "Balloons", points: 12 },
        { text: "Drinks", points: 9 },
        { text: "Snacks/Chips", points: 7 },
        { text: "Candles", points: 5 },
        { text: "Plates/Cups", points: 3 },
        { text: "Games", points: 3 },
      ],
      multiplier: 1,
    },
    {
      question: "Name a reason a video shoot runs late:",
      answers: [
        { text: "Technical issues", points: 29 },
        { text: "Talent arrives late", points: 24 },
        { text: "Last-minute script changes", points: 17 },
        { text: "Lighting setup", points: 12 },
        { text: "Audio problems", points: 8 },
        { text: "Location issues", points: 6 },
        { text: "Wardrobe/makeup", points: 3 },
        { text: "Weather", points: 1 },
      ],
      multiplier: 1,
    },
    {
      question: "Name a place you shouldn't check your phone:",
      answers: [
        { text: "Driving", points: 40 },
        { text: "Movie theater", points: 18 },
        { text: "Dinner date", points: 15 },
        { text: "Class/Meeting", points: 12 },
        { text: "Church/Service", points: 8 },
        { text: "Gym", points: 4 },
        { text: "Bathroom", points: 2 },
        { text: "Wedding", points: 1 },
      ],
      multiplier: 2,
    },
  ],
  fastMoneyPrompts: [
    "A breakfast food you can eat on the go",
    "Something people lose all the time",
    "A reason you might be late",
    "A chore kids get paid to do",
    "A fruit you can peel",
  ],
  suddenDeath: [
    { question: "Name the most important meal of the day", answer: { text: "Breakfast", points: 78 }, multiplier: 3 },
  ],
};

// TV-style default multipliers by round index (0-based): 1,1,2,3,3,...
function defaultMultiplierByIndex(idx) {
  if (idx >= 3) return 3;
  if (idx >= 2) return 2;
  return 1;
}
function labelForMult(m) {
  return m === 1 ? "Single" : m === 2 ? "Double" : "Triple";
}

// ---------------- Sounds ----------------
function useAudio() {
  const store = useRef({});
  const [volume, setVolume] = useState(0.9);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/";
    const files = {
      ding: `${base}feud-ding.mp3`,
      buzz: `${base}feud-buzzer.mp3`,
      blip: `${base}feud-reveal.mp3`,
      buzzA: `${base}feud-buzz-a.mp3`,
      buzzB: `${base}feud-buzz-b.mp3`,
    };
    for (const [k, src] of Object.entries(files)) {
      const a = new Audio(src);
      a.preload = "auto";
      a.volume = volume;
      a.crossOrigin = "anonymous";
      store.current[k] = a;
    }
  }, []);

  useEffect(() => {
    Object.values(store.current).forEach((a) => {
      if (a && "volume" in a) a.volume = volume;
    });
  }, [volume]);

  // WebAudio fallback tones
  function fb(chain = []) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = store.current.ctx || new Ctx();
    store.current.ctx = ctx;
    let t = ctx.currentTime;
    chain.forEach(([f, ms]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.25 * volume, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + ms / 1000 + 0.02);
      t += ms / 1000 + 0.04;
    });
  }
  const play = (k, chain) => store.current[k]?.play().catch(() => fb(chain));

  return {
    volume,
    setVolume,
    ding: () => play("ding", [[880, 140], [1320, 140]]),
    buzz: () => play("buzz", [[140, 260]]),
    blip: () => play("blip", [[520, 120]]),
    buzzA: () => play("buzzA", [[820, 160], [600, 160]]),
    buzzB: () => play("buzzB", [[300, 200], [220, 220]]),
  };
}

// --------------- Optional Theme Music ---------------
function useThemeMusic() {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    ref.current = new Audio(`${import.meta.env.BASE_URL || "/"}feud-theme.mp3`);
    ref.current.preload = "auto";
    ref.current.loop = false;
  }, []);
  const play = async () => {
    if (!ref.current) return;
    try {
      ref.current.currentTime = 0;
      await ref.current.play();
      setPlaying(true);
    } catch {}
  };
  const stop = () => {
    if (!ref.current) return;
    const a = ref.current;
    let vol = a.volume;
    const id = setInterval(() => {
      vol -= 0.06;
      if (vol <= 0) {
        a.pause();
        a.volume = 1;
        clearInterval(id);
        setPlaying(false);
      } else a.volume = vol;
    }, 60);
  };
  return { playing, play, stop };
}

export default function FamilyFeudApp() {
  const [data, setData] = useState(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  // Phases: 'faceoff' | 'round' | 'steal' | 'sudden' | 'fast'
  const [phase, setPhase] = useState("faceoff");

  // Indexes
  const [roundIndex, setRoundIndex] = useState(0);
  const [suddenIndex, setSuddenIndex] = useState(0);

  // Core round state
  const [revealed, setRevealed] = useState(() => Array(8).fill(false));
  const [strikes, setStrikes] = useState(0);
  const [bank, setBank] = useState(0);
  const [teamA, setTeamA] = useState(0);
  const [teamB, setTeamB] = useState(0);

  // Faceoff control
  const [faceoffBuzz, setFaceoffBuzz] = useState(null); // 'A'|'B'|null
  const [faceoffTurn, setFaceoffTurn] = useState(null); // who answers now in faceoff/sudden
  const [controlTeam, setControlTeam] = useState(null); // which team controls the board during round

  // Fast Money
  const [fmPoints1, setFmPoints1] = useState(Array(5).fill(0));
  const [fmPoints2, setFmPoints2] = useState(Array(5).fill(0));
  const [fmShown, setFmShown] = useState(Array(5).fill(false)); // prompts hidden by default

  // Audio + theme
  const { ding, buzz, blip, buzzA, buzzB, volume, setVolume } = useAudio();
  const theme = useThemeMusic();

  // Load JSON
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL || "/"}rounds.json`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        if (!cancelled) {
          setData({
            rounds: json.rounds?.length ? json.rounds : FALLBACK.rounds,
            fastMoneyPrompts: json.fastMoneyPrompts?.length ? json.fastMoneyPrompts : FALLBACK.fastMoneyPrompts,
            suddenDeath: json.suddenDeath?.length ? json.suddenDeath : FALLBACK.suddenDeath,
          });
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true); // fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Current round/sudden and multipliers
  const currentRound = data.rounds[Math.min(roundIndex, data.rounds.length - 1)];
  const roundMultiplier =
    (currentRound && typeof currentRound.multiplier === "number")
      ? currentRound.multiplier
      : defaultMultiplierByIndex(roundIndex);

  const suddenItem = data.suddenDeath[Math.min(suddenIndex, data.suddenDeath.length - 1)];
  const suddenMultiplier =
    (suddenItem && typeof suddenItem.multiplier === "number") ? suddenItem.multiplier : 3;

  // Render answers (8 for normal; 1 for sudden)
  const answers = useMemo(() => {
    if (phase === "sudden") {
      const a = suddenItem?.answer ? [suddenItem.answer] : [];
      while (a.length < 1) a.push({ text: "", points: 0 });
      return a;
    }
    const base = currentRound?.answers?.slice?.(0, 8) || [];
    while (base.length < 8) base.push({ text: "", points: 0 });
    return base;
  }, [phase, currentRound, suddenItem]);

  // Keyboard
  useEffect(() => {
    function onKey(e) {
      if (e.repeat) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;

      const k = e.key.toLowerCase();

      // Faceoff & Sudden buzzing (lockout after first)
      if ((phase === "faceoff" || phase === "sudden") && !faceoffBuzz) {
        if (k === "q") {
          setFaceoffBuzz("A");
          setFaceoffTurn("A");
          buzzA();
          return;
        }
        if (k === "p") {
          setFaceoffBuzz("B");
          setFaceoffTurn("B");
          buzzB();
          return;
        }
      }

      // Pass on wrong during faceoff/sudden
      if ((phase === "faceoff" || phase === "sudden") && k === "x" && faceoffBuzz) {
        passFaceoff();
        return;
      }

      // Reveal tiles (not in fast money)
      if (k >= "1" && k <= "8" && phase !== "fast") {
        toggleReveal(parseInt(k, 10) - 1);
        return;
      }

      // Strikes (round only)
      if (phase === "round" && k === "x") {
        addStrike();
        return;
      }

      // Globals
      if (k === "a") award("A");
      else if (k === "l") award("B");
      else if (k === "n") nextRound();
      else if (k === "r") restart();
      else if (k === "f") toggleFullscreen();
      else if (k === "d") ding();
      else if (k === "b") buzz();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, faceoffBuzz, faceoffTurn, revealed, bank, controlTeam, strikes, roundMultiplier, suddenMultiplier]);

  // Actions
  function startFaceoff() {
    setPhase("faceoff");
    setFaceoffBuzz(null);
    setFaceoffTurn(null);
    setControlTeam(null);
    setRevealed(Array(8).fill(false));
    setStrikes(0);
    setBank(0);
  }
  function startSudden() {
    setPhase("sudden");
    setFaceoffBuzz(null);
    setFaceoffTurn(null);
    setControlTeam(null);
    setRevealed([false]);
    setStrikes(0);
    setBank(0);
  }
  function beginRound(team) {
    if (!faceoffBuzz) return;
    setControlTeam(team);
    setPhase("round");
    blip();
  }
  function passFaceoff() {
    if (!faceoffBuzz) return;
    setFaceoffTurn((t) => (t === "A" ? "B" : "A"));
    buzz();
  }

  function toggleReveal(i) {
    const slot = answers[i];
    if (!slot || !slot.points) return;

    // Sudden Death: reveal the single top answer, award immediately, jump to Fast
    if (phase === "sudden") {
      setRevealed((prev) => {
        const next = [...prev];
        const on = !next[i];
        next[i] = on;
        if (on) {
          ding();
          const payout = slot.points * suddenMultiplier;
          if (faceoffTurn === "A") setTeamA((s) => s + payout);
          else setTeamB((s) => s + payout);
          setBank(0);
          setTimeout(() => setPhase("fast"), 700);
        }
        return next;
      });
      return;
    }

    // Regular/Steal rounds: bank adjusts live (no freeze during steal)
    setRevealed((prev) => {
      const next = [...prev];
      const on = !next[i];
      next[i] = on;
      if (on) {
        setBank((b) => b + slot.points);
        ding();
      } else {
        setBank((b) => Math.max(0, b - slot.points));
      }
      return next;
    });
  }

  function addStrike() {
    setStrikes((s) => {
      const ns = Math.min(3, s + 1);
      buzz();
      if (ns === 3) setPhase("steal");
      return ns;
    });
  }

  function award(team) {
    if (bank <= 0) return;
    const mult = phase === "sudden" ? suddenMultiplier : roundMultiplier;
    const payout = bank * mult;
    if (team === "A") setTeamA((s) => s + payout);
    else setTeamB((s) => s + payout);
    setBank(0);
  }

  function nextRound() {
    // If currently in Sudden, move to Fast Money
    if (phase === "sudden") {
      setPhase("fast");
      return;
    }

    // End of the prepared rounds?
    if (roundIndex + 1 >= data.rounds.length) {
      if (teamA === teamB && data.suddenDeath.length > 0) {
        // Tied → Sudden Death
        setSuddenIndex((i) => Math.min(i + 0, data.suddenDeath.length - 1));
        startSudden();
        return;
      }
      // Else straight to Fast Money
      setPhase("fast");
      setFaceoffBuzz(null);
      setFaceoffTurn(null);
      setControlTeam(null);
      setRevealed(Array(8).fill(false));
      setStrikes(0);
      setBank(0);
      setFmShown(Array(5).fill(false));
      return;
    }

    // Advance to next round
    setRoundIndex((i) => i + 1);
    startFaceoff();
  }

  function restart() {
    setPhase("faceoff");
    setRoundIndex(0);
    setSuddenIndex(0);
    setRevealed(Array(8).fill(false));
    setStrikes(0);
    setBank(0);
    setTeamA(0);
    setTeamB(0);
    setFaceoffBuzz(null);
    setFaceoffTurn(null);
    setControlTeam(null);
    setFmPoints1(Array(5).fill(0));
    setFmPoints2(Array(5).fill(0));
    setFmShown(Array(5).fill(false));
  }

  function toggleFullscreen() {
    const doc = document;
    const el = document.documentElement;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
    }
  }

  // Steal helpers
  const stealingTeam = controlTeam === "A" ? "B" : "A";
  function resolveSteal(success) {
    if (success) award(stealingTeam);
    else award(controlTeam ?? "A");
    // Remain on same round; hit Next Round when ready
  }

  // Fast money totals
  const fmTotal1 = fmPoints1.reduce((a, b) => a + (Number(b) || 0), 0);
  const fmTotal2 = fmPoints2.reduce((a, b) => a + (Number(b) || 0), 0);

  // UI helpers
  const h1Size = "text-2xl sm:text-3xl md:text-4xl";
  const awardDisabled = bank <= 0;
  const activeMult = phase === "sudden" ? suddenMultiplier : roundMultiplier;
  const multLabel = labelForMult(activeMult);

  return (
    <div
      className="min-h-[100dvh] text-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={{ ...gradientBg, fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <h1 className={cls(h1Size, "font-extrabold tracking-tight drop-shadow")}>
            JON FEUD {loaded ? "" : "· loading…"}
          </h1>
          <div className="flex items-end gap-3 md:gap-4">
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider opacity-90">Volume</div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(parseInt(e.target.value, 10) / 100)}
                className="w-28 accent-white"
              />
            </div>
            <button
              onClick={theme.playing ? theme.stop : theme.play}
              className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold transition"
            >
              {theme.playing ? "Stop Music" : "Play Music"}
            </button>
            <button
              onClick={toggleFullscreen}
              className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold transition"
            >
              Fullscreen
            </button>
          </div>
        </header>

        {/* Scoreboard */}
        <section className="mt-4 grid grid-cols-2 gap-3">
          <div
            className={cls(
              "bg-white/10 rounded-2xl p-4 backdrop-blur-md transition",
              (phase === "round" && controlTeam === "A") ||
                ((phase === "faceoff" || phase === "sudden") && faceoffTurn === "A") ||
                (phase === "steal" && stealingTeam === "A")
                ? "ring-4 ring-yellow-300"
                : ""
            )}
          >
            <div className="text-sm uppercase tracking-widest opacity-80">Team A</div>
            <div className="text-4xl font-black tabular-nums">{teamA}</div>
          </div>
          <div
            className={cls(
              "bg-white/10 rounded-2xl p-4 backdrop-blur-md transition",
              (phase === "round" && controlTeam === "B") ||
                ((phase === "faceoff" || phase === "sudden") && faceoffTurn === "B") ||
                (phase === "steal" && stealingTeam === "B")
                ? "ring-4 ring-yellow-300"
                : ""
            )}
          >
            <div className="text-sm uppercase tracking-widest opacity-80">Team B</div>
            <div className="text-4xl font-black tabular-nums">{teamB}</div>
          </div>
        </section>

        {/* --------- Main panel (Rounds / Faceoff / Sudden / Steal) --------- */}
        {phase !== "fast" && (
          <section className="mt-4 bg-white/10 rounded-2xl p-4 md:p-6 backdrop-blur-md select-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-widest opacity-80">
                {phase === "sudden" ? (
                  <>
                    Sudden Death ·{" "}
                    <span className="px-2 py-0.5 rounded bg-yellow-300 text-black font-bold">
                      {multLabel} ×{activeMult}
                    </span>
                  </>
                ) : (
                  <>
                    Round {roundIndex + 1} / {data.rounds.length} ·{" "}
                    <span className="px-2 py-0.5 rounded bg-yellow-300 text-black font-bold">
                      {multLabel} ×{activeMult}
                    </span>
                  </>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-widest opacity-80">Bank</div>
                <div className="text-3xl md:text-4xl font-black tabular-nums">{bank}</div>
                <div className="text-[11px] opacity-80">
                  Payout: {bank} × {activeMult} = {bank * activeMult}
                </div>
              </div>
            </div>

            {/* Hidden question during faceoff/sudden */}
            <div className="mt-2">
              {phase === "faceoff" || phase === "sudden" ? (
                <div className="text-sm md:text-base uppercase tracking-[0.18em] text-white/85">
                  Question hidden — Host reading aloud. Buzz with <strong>Q</strong> (Team A) or{" "}
                  <strong>P</strong> (Team B).
                  {faceoffBuzz ? (
                    <span className="ml-2 normal-case tracking-normal">
                      <span className="opacity-85">Buzzed: </span>
                      <span className="font-bold">Team {faceoffBuzz}</span> ·{" "}
                      <span className="opacity-85">Awaiting answer:</span>{" "}
                      <span className="font-bold">Team {faceoffTurn}</span>
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="text-xl md:text-2xl font-bold leading-snug drop-shadow-sm">
                  {currentRound?.question || "—"}
                </div>
              )}
            </div>

            {/* Answers board */}
            <div
              className={cls(
                "mt-4 grid gap-3",
                phase === "sudden" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
              )}
            >
              {answers.map((a, i) => {
                const isBlank = !a.points;
                const shown = revealed[i];
                return (
                  <button
                    key={i}
                    disabled={isBlank}
                    onClick={() => toggleReveal(i)}
                    className={cls(
                      "relative text-left rounded-2xl p-4 min-h-[64px] shadow transition focus:outline-none",
                      "bg-white text-black hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                    title={isBlank ? "" : `Toggle answer ${i + 1} (key ${i + 1})`}
                  >
                    {!isBlank && (
                      <div className="absolute right-3 top-2 text-xs font-bold opacity-60">
                        {i + 1}
                      </div>
                    )}
                    {isBlank ? (
                      <div className="text-sm opacity-40">— Empty —</div>
                    ) : shown ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-lg font-semibold">{a.text}</div>
                        <div className="text-2xl font-black tabular-nums">{a.points}</div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="h-5 w-5 rounded-full bg-black/10" />
                        <div className="text-lg font-semibold opacity-60">Reveal</div>
                        <div className="h-5 w-10 rounded bg-black/10" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Faceoff controls */}
            {(phase === "faceoff" || phase === "sudden") && (
              <div className="mt-4 bg-white/5 rounded-xl p-3 flex flex-wrap items-center gap-2">
                <div className="text-sm">
                  Faceoff: <strong>Q</strong> (Team A) • <strong>P</strong> (Team B) ·{" "}
                  <span className="opacity-85">Buzz: </span>
                  <span className="font-bold">{faceoffBuzz ?? "—"}</span>
                </div>

                {phase === "faceoff" ? (
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={() => beginRound("A")}
                      disabled={!faceoffBuzz}
                      className={cls(
                        "px-3 py-2 rounded-xl font-semibold transition",
                        faceoffTurn === "A"
                          ? "bg-yellow-300 text-black hover:opacity-90"
                          : "bg-white/10 hover:bg-white/20",
                        !faceoffBuzz ? "opacity-50 cursor-not-allowed" : ""
                      )}
                    >
                      Control → Team A
                    </button>
                    <button
                      onClick={() => beginRound("B")}
                      disabled={!faceoffBuzz}
                      className={cls(
                        "px-3 py-2 rounded-xl font-semibold transition",
                        faceoffTurn === "B"
                          ? "bg-yellow-300 text-black hover:opacity-90"
                          : "bg-white/10 hover:bg-white/20",
                        !faceoffBuzz ? "opacity-50 cursor-not-allowed" : ""
                      )}
                    >
                      Control → Team B
                    </button>
                    <button
                      onClick={passFaceoff}
                      disabled={!faceoffBuzz}
                      className={cls(
                        "px-3 py-2 rounded-xl font-semibold transition",
                        "bg-red-400 text-black hover:opacity-90",
                        !faceoffBuzz ? "opacity-50 cursor-not-allowed" : ""
                      )}
                      title="Wrong → pass turn (or press X)"
                    >
                      Pass to Team {faceoffTurn === "A" ? "B" : "A"}
                    </button>
                    <button
                      onClick={startFaceoff}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
                    >
                      Reset Faceoff
                    </button>
                  </div>
                ) : (
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={passFaceoff}
                      disabled={!faceoffBuzz}
                      className={cls(
                        "px-3 py-2 rounded-xl font-semibold transition",
                        "bg-red-400 text-black hover:opacity-90",
                        !faceoffBuzz ? "opacity-50 cursor-not-allowed" : ""
                      )}
                      title="Wrong → pass turn (or press X)"
                    >
                      Pass to Team {faceoffTurn === "A" ? "B" : "A"}
                    </button>
                    <button
                      onClick={startSudden}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
                    >
                      Reset Sudden
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Strikes (show in Round and Steal) */}
            {(phase === "round" || phase === "steal") && (
              <div className="mt-4 flex items-center gap-2">
                <div className="text-sm uppercase tracking-widest opacity-80">
                  Strikes — Team {controlTeam}
                </div>
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((n) => (
                    <div
                      key={n}
                      className={cls(
                        "h-9 w-9 rounded-xl grid place-items-center text-xl font-black transition",
                        strikes > n ? "bg-red-500 text-white" : "bg-white/20 text-white/50"
                      )}
                    >
                      {strikes > n ? "✖" : "—"}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addStrike}
                  disabled={phase !== "round"}
                  className={cls(
                    "ml-2 px-3 py-2 rounded-xl text-sm font-semibold transition",
                    phase === "round" ? "bg-white/20 hover:bg-white/30" : "bg-white/10 text-white/60 cursor-not-allowed"
                  )}
                  title="Add strike (X)"
                >
                  Add Strike
                </button>
              </div>
            )}

            {/* Steal panel (renders when phase === 'steal') */}
            {phase === "steal" && (
              <div className="mt-4 bg-white/5 rounded-xl p-3 flex flex-wrap items-center gap-2">
                <div className="text-sm">
                  <strong>Steal!</strong> Team {stealingTeam} gets one guess. If correct, they take the
                  bank.
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => resolveSteal(true)}
                    className="px-3 py-2 rounded-xl bg-green-400 text-black font-semibold hover:opacity-90 transition"
                  >
                    Steal Success → Team {stealingTeam}
                  </button>
                  <button
                    onClick={() => resolveSteal(false)}
                    className="px-3 py-2 rounded-xl bg-red-400 text-black font-semibold hover:opacity-90 transition"
                  >
                    Steal Fail → Team {controlTeam ?? "?"}
                  </button>
                </div>
              </div>
            )}

            {/* Core round controls */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => award("A")}
                disabled={awardDisabled}
                className={cls(
                  "px-4 py-2 rounded-xl font-semibold transition",
                  awardDisabled ? "bg-white/20 text-white/60 cursor-not-allowed" : "bg-white text-black hover:opacity-90"
                )}
                title="Award bank to Team A (A)"
              >
                Award → Team A
              </button>
              <button
                onClick={() => award("B")}
                disabled={awardDisabled}
                className={cls(
                  "px-4 py-2 rounded-xl font-semibold transition",
                  awardDisabled ? "bg-white/20 text-white/60 cursor-not-allowed" : "bg-white text-black hover:opacity-90"
                )}
                title="Award bank to Team B (L)"
              >
                Award → Team B
              </button>
              <button
                onClick={nextRound}
                className="px-4 py-2 rounded-xl bg-black/40 text-white hover:bg-black/50 transition"
                title="Next round (N)"
              >
                Next Round
              </button>
              <button
                onClick={restart}
                className="px-4 py-2 rounded-xl bg-black/40 text-white hover:bg-black/50 transition"
                title="Restart game (R)"
              >
                Restart
              </button>
            </div>

            {/* Legend */}
            <div className="mt-3 text-xs opacity-80">
              <span className="font-semibold">Keys:</span> Q/P buzz • X pass (faceoff/sudden) or strike
              (round) • 1–8 reveal • A/L award • N next • R restart • F fullscreen • D ding • B buzzer
            </div>
          </section>
        )}

        {/* ----------------- FAST MONEY ----------------- */}
        {phase === "fast" && (
          <section className="mt-6 bg-white/10 rounded-2xl p-5 md:p-7 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xl md:text-2xl font-black">Fast Money</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPhase("faceoff")}
                  className="px-3 py-2 rounded-xl bg-black/40 hover:bg-black/50 transition"
                  title="Back to rounds"
                >
                  Back to Rounds
                </button>
                <button
                  onClick={() => {
                    setFmPoints1(Array(5).fill(0));
                    setFmPoints2(Array(5).fill(0));
                    setFmShown(Array(5).fill(false));
                  }}
                  className="px-3 py-2 rounded-xl bg-white text-black hover:opacity-90 transition font-semibold"
                >
                  Reset Fast Money
                </button>
                <button
                  onClick={() => {
                    const idx = fmShown.findIndex((x) => !x);
                    if (idx !== -1) {
                      setFmShown((arr) => arr.map((v, i) => (i === idx ? true : v)));
                      blip();
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition"
                >
                  Next Prompt
                </button>
              </div>
            </div>

            <div className="mt-2 text-sm opacity-85">
              Host reads prompts aloud. Only type the <strong>points</strong> awarded for each player from
              your sheet.
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[600px] w-full text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-widest opacity-80">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Prompt</th>
                    <th className="py-2 pr-2">Player 1 pts</th>
                    <th className="py-2 pr-2">Player 2 pts</th>
                    <th className="py-2 pr-2">Show</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.fastMoneyPrompts || []).slice(0, 5).map((p, i) => (
                    <tr key={i} className="border-t border-white/10 align-middle">
                      <td className="py-2 pr-2 font-semibold">{i + 1}</td>
                      <td className="py-2 pr-2">
                        {fmShown[i] ? p : <span className="uppercase tracking-widest text-white/70 text-xs">Hidden</span>}
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={fmPoints1[i]}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d]/g, "");
                            setFmPoints1((arr) => arr.map((x, j) => (j === i ? Number(v || 0) : x)));
                          }}
                          className="w-20 px-2 py-1 rounded bg-white text-black font-semibold"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={fmPoints2[i]}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d]/g, "");
                            setFmPoints2((arr) => arr.map((x, j) => (j === i ? Number(v || 0) : x)));
                          }}
                          className="w-20 px-2 py-1 rounded bg-white text-black font-semibold"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => setFmShown((arr) => arr.map((v, j) => (j === i ? !v : v)))}
                          className={cls(
                            "px-2 py-1 rounded text-sm font-semibold transition",
                            fmShown[i] ? "bg-white text-black hover:opacity-90" : "bg-white/20 hover:bg-white/30 text-white"
                          )}
                        >
                          {fmShown[i] ? "Hide" : "Reveal"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-white/20">
                    <td />
                    <td className="py-3 font-black">Totals</td>
                    <td className="py-3 text-2xl font-black">{fmTotal1}</td>
                    <td className="py-3 text-2xl font-black">{fmTotal2}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
