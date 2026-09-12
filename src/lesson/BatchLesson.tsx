import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Layers3, Pause, Play, RotateCcw, Send, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { buildLessonRun, lessonSnapshot, teachingSeconds, type Experiment, type Strategy, type Traffic } from "./simulation";
import type { LessonPhase } from "./LessonScene";
import "./lesson.css";

const LessonScene = lazy(() => import("./LessonScene"));
const sample = "Explain why the sky is blue.";
const chapters = ["Send", "Batch", "Compute", "Compare"];
const strategyName = (experiment: Experiment, strategy: Strategy) => experiment === "waiting"
  ? strategy === "quick" ? "Run now" : "Wait & batch"
  : strategy === "quick" ? "One at a time" : "Up to 4 together";

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export default function BatchLesson() {
  const [phase, setPhase] = useState<LessonPhase>("intro");
  const [question, setQuestion] = useState(sample);
  const [experiment, setExperiment] = useState<Experiment>("waiting");
  const [traffic, setTraffic] = useState<Traffic>("staggered");
  const [strategy, setStrategy] = useState<Strategy>("quick");
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [records, setRecords] = useState<Strategy[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const elapsed = useRef(0);
  const reduced = useReducedMotion();
  const run = useMemo(() => buildLessonRun(experiment, strategy, traffic), [experiment, strategy, traffic]);
  const snapshot = useMemo(() => lessonSnapshot(run, time), [run, time]);
  const compared = records.length === 2;
  const phaseIndex = phase === "intro" ? 0 : phase === "arrival" || phase === "choice" ? 1 : phase === "running" ? 2 : 3;

  useEffect(() => {
    if (phase !== "arrival" && phase !== "running" || paused) return;
    let frame = 0;
    let last = performance.now();
    let lastPaint = 0;
    const limit = phase === "arrival" ? 1300 : run.duration;
    const tick = (now: number) => {
      const delta = Math.min(now - last, 80); last = now;
      // Teaching playback is slower than its transparent simulated clock.
      elapsed.current = Math.min(limit, elapsed.current + delta * (phase === "running" ? 0.6 : 1));
      if (now - lastPaint > 32 || elapsed.current === limit) { setTime(elapsed.current); lastPaint = now; }
      if (elapsed.current >= limit) {
        if (phase === "arrival") setPhase("choice");
        else { setRecords(previous => previous.includes(strategy) ? previous : [...previous, strategy]); setPhase("result"); }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, paused, run, strategy]);

  useEffect(() => {
    const hide = () => { if (document.hidden && (phase === "running" || phase === "arrival")) setPaused(true); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [phase]);

  useEffect(() => {
    if (sourcesOpen && !dialog.current?.open) dialog.current?.showModal();
  }, [sourcesOpen]);

  function reset(nextExperiment: Experiment = "waiting", nextTraffic: Traffic = "staggered") {
    elapsed.current = 0; setTime(0); setPaused(false); setRecords([]);
    setExperiment(nextExperiment); setTraffic(nextTraffic); setPhase(nextExperiment === "size" || nextTraffic === "simultaneous" ? "choice" : "intro");
    setShowInput(false);
    stage.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }
  function send() {
    if (!question.trim()) return;
    elapsed.current = 0; setTime(0); setPaused(false); setShowInput(false); setPhase("arrival");
  }
  function choose(next: Strategy) {
    elapsed.current = 0; setTime(0); setStrategy(next); setPaused(false); setPhase("running");
    if (stage.current && stage.current.getBoundingClientRect().top < -100) stage.current.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }
  const headline = phase === "intro" ? "Why is my request waiting?"
    : phase === "arrival" ? "Sent doesn't mean started."
    : phase === "choice" ? experiment === "size" ? "How many should run together?" : traffic === "simultaneous" ? "Everyone arrives at once. Now what?" : "Your request is here. Start now?"
    : phase === "running" ? snapshot.computing.length === 1 ? "One request is being processed." : snapshot.computing.length ? `${snapshot.computing.length} requests. One round of work.` : "A short wait. Room for more."
    : compared ? "Faster for you. Or sooner for everyone?" : "All four requests are done.";
  const explanation = phase === "intro" ? "Follow one request into a server. Discover what batching changes."
    : phase === "arrival" ? "Your request reaches the server, then waits to be scheduled."
    : phase === "choice" ? experiment === "size" ? "Same requests, arrival times, and server. Only the batch limit changes." : traffic === "simultaneous" ? "All four requests are here. Is there any reason to keep waiting?" : "Start with your request, or wait briefly to let others join the batch."
    : phase === "running" ? snapshot.computing.length ? "Separate inputs. Separate results. A shared round of computation." : "A full batch starts immediately. Otherwise, the waiting window has a limit."
    : compared ? experiment === "waiting" && traffic === "simultaneous" ? "No one is missing. Both strategies start immediately and finish together." : "Same four requests, different priorities. Compare what each choice achieves."
    : "Try the other strategy with exactly the same requests.";

  return <div className="batch-lesson" data-lesson-phase={phase} data-lesson-paused={paused} data-lesson-time={Math.round(time)} data-lesson-experiment={experiment}>
    <header className="lesson-nav">
      <a href={import.meta.env.BASE_URL} className="lesson-brand" aria-label="Batch lesson home"><span className="lesson-brand-icon"><Layers3 size={22} strokeWidth={1.8} /></span>batch<span className="lesson-brand-dot">.</span></a>
      <span className="lesson-course-name">AI, behind the scenes</span>
      <button className="lesson-text-button" onClick={() => setSourcesOpen(true)}>About this lesson <ArrowUpRight size={15} /></button>
    </header>

    <main>
      <section className="lesson-stage" ref={stage} aria-label="Interactive batching lesson">
        <nav className="lesson-chapters" aria-label="Lesson progress">
          {chapters.map((chapter, index) => <div key={chapter} data-active={index === phaseIndex} data-past={index < phaseIndex} aria-current={index === phaseIndex ? "step" : undefined}><span>{index < phaseIndex ? <Check size={13} /> : `0${index + 1}`}</span><span>{chapter}</span></div>)}
        </nav>

        <div className="lesson-heading" aria-live="polite" aria-atomic="true">
          <h1>{headline}</h1><p>{explanation}</p>
        </div>

        <div className="lesson-exhibit">
          <div className="lesson-exhibit-bar">
            <span className="lesson-identity"><i /> A · Your request</span>
            {phase === "running" || phase === "result" ? <span className="lesson-running-label">{strategyName(experiment, strategy)}<span className="lesson-clock">{teachingSeconds(time)} <small>s simulated</small></span></span> : <span className="lesson-exhibit-note">Inside the server</span>}
          </div>
          <Suspense fallback={<div className="lesson-scene-loading"><Layers3 size={30} /><span>Preparing the scene</span></div>}>
            <LessonScene phase={phase} run={run} time={time} paused={paused} reduced={reduced} />
          </Suspense>
          <div className="lesson-scene-caption" aria-live="polite">
            {phase === "intro" ? <><span className="lesson-mini-ticket">A</span><span>{question || "Your question"}</span></>
              : phase === "arrival" ? <><span className="lesson-mini-ticket">A</span><span>Your request is arriving at the server</span></>
              : phase === "choice" ? <><span className="lesson-mini-ticket">A</span><span>{experiment === "size" || traffic === "simultaneous" ? "Four independent requests, ready to be scheduled" : "Your request is waiting. The server is idle."}</span></>
              : <><span className="lesson-caption-stat">Waiting <b>{snapshot.queued.length}</b></span><span className="lesson-caption-stat">Working <b>{snapshot.computing.length}</b></span><span className="lesson-caption-stat">Done <b>{snapshot.done.length}</b></span></>}
          </div>
        </div>

        <div className="lesson-action-area">
          {phase === "intro" && <>
            {showInput && <form className="lesson-input" onSubmit={event => { event.preventDefault(); send(); }}><label htmlFor="lesson-question">Your question</label><input id="lesson-question" autoFocus value={question} maxLength={80} onChange={event => setQuestion(event.target.value)} /><span>All requests use equal work in this model. Your wording doesn't change the timing.</span></form>}
            <div className="lesson-action-row"><button className="lesson-primary" onClick={send} disabled={!question.trim()}>Send my request <Send size={17} /></button><button className="lesson-text-button" onClick={() => setShowInput(value => !value)}>{showInput ? "Keep this question" : "Change question"}</button></div>
          </>}
          {phase === "arrival" && <button className="lesson-secondary" onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? "Resume" : "Pause"}</button>}
          {phase === "choice" && <div className="lesson-choice-row">
            <button className="lesson-secondary" data-lesson-choice="quick" onClick={() => choose("quick")}>{strategyName(experiment, "quick")}<ArrowRight size={17} /></button>
            <button className="lesson-primary" data-lesson-choice="together" onClick={() => choose("together")}>{strategyName(experiment, "together")}<Layers3 size={17} /></button>
          </div>}
          {phase === "running" && <div className="lesson-playback"><button className="lesson-icon-button" onClick={() => setPaused(value => !value)} aria-label={paused ? "Resume playback" : "Pause playback"} title={paused ? "Resume playback" : "Pause playback"}>{paused ? <Play size={18} /> : <Pause size={18} />}</button><div className="lesson-progress" role="progressbar" aria-label="Current run" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(time / run.duration * 100)}><i style={{ transform: `scaleX(${time / run.duration})` }} /></div><button className="lesson-icon-button" onClick={() => choose(strategy)} aria-label="Replay this run" title="Replay this run"><RotateCcw size={17} /></button></div>}
          {phase === "result" && <div className="lesson-action-row">{!compared ? <button className="lesson-primary" onClick={() => choose(strategy === "quick" ? "together" : "quick")}>Try the other strategy <ArrowRight size={17} /></button> : <button className="lesson-secondary" onClick={() => choose(strategy)}><RotateCcw size={16} />Replay this run</button>}<button className="lesson-text-button" onClick={() => reset()}>Start over</button></div>}
        </div>
      </section>

      {phase === "result" && <section className="lesson-results" aria-label="Simulation results" data-lesson-results>
        <div className="lesson-section-heading"><h2>{compared ? "Same requests. Two choices." : "Your first result"}</h2><span>Simulated time</span></div>
        <div className="lesson-table" role="table" aria-label="Strategy comparison">
          <div className="lesson-table-row lesson-table-head" role="row"><span role="columnheader">Strategy</span><span role="columnheader">Your request done</span><span role="columnheader">All 4 done</span></div>
          {records.map(record => {
            const result = buildLessonRun(experiment, record, traffic);
            return <div className="lesson-table-row" role="row" key={record} data-lesson-record={record}><strong role="rowheader">{strategyName(experiment, record)}</strong><div role="cell"><b>{teachingSeconds(result.requests[0].end)}</b><small>s</small><i className="lesson-result-bar" style={{ width: `${result.requests[0].end / 8800 * 100}%` }} /></div><div role="cell"><b>{teachingSeconds(result.duration)}</b><small>s</small><i className="lesson-result-bar" data-total style={{ width: `${result.duration / 8800 * 100}%` }} /></div></div>;
          })}
        </div>
        {compared && <div className="lesson-takeaway"><span className="lesson-takeaway-icon"><Check size={19} /></span><p>{experiment === "waiting" && traffic === "simultaneous" ? "Batching doesn't always mean waiting. With all four requests already here, both strategies give the same result." : experiment === "size" ? "A smaller batch finishes your first-in-line request sooner. A larger batch finishes everyone in fewer rounds. Faster depends on what you measure." : "Starting now gets your result back sooner. Waiting briefly finishes all four requests in fewer rounds, and less total time in this model."}</p></div>}
        {compared && <div className="lesson-next-experiment"><span>Change one condition. Does the result still hold?</span><div>{experiment === "waiting" && traffic === "staggered" && <button className="lesson-secondary" onClick={() => reset("waiting", "simultaneous")}>What if everyone arrives at once? <ArrowRight size={16} /></button>}{experiment !== "size" && <button className="lesson-secondary" onClick={() => reset("size", "simultaneous")}>What if batches are smaller? <ArrowRight size={16} /></button>}{experiment === "size" && <button className="lesson-secondary" onClick={() => reset()}>Back to the first lesson <RotateCcw size={16} /></button>}</div></div>}
      </section>}

      <section className="lesson-notes" aria-label="Explore further">
        <div className="lesson-notes-heading"><span>A little deeper</span><ArrowDown size={17} /></div>
        <details><summary>What exactly is a batch?<ChevronDown size={18} /></summary><p>Here, a batch is a group of requests scheduled in the same round of computation. Each keeps its own input and result. They don't become one combined question.</p><p>This model zooms in on one round of equal-work requests. Real language models process the input, then generate an answer piece by piece. Some serving systems update the batch at every generation step.</p></details>
        <details><summary>Is this how Fast Mode works?<ChevronDown size={18} /></summary><p>This lesson explores the trade-off between individual response time and overall throughput. Batching is one way to understand that trade-off. Resource allocation, hardware, and other inference optimizations also affect speed.</p><p>The public documentation doesn't specify OpenAI Fast Mode's internal batch settings. These strategies are a teaching example, not a reconstruction of that product.</p><a href="https://developers.openai.com/api/docs/guides/fast-mode" target="_blank" rel="noreferrer">OpenAI's official Fast Mode guide <ArrowUpRight size={14} /></a></details>
        <details><summary>Where do these timings come from?<ChevronDown size={18} /></summary><p>These are simulated seconds, not GPT benchmarks. Each round takes 1.9 seconds of fixed overhead plus 0.3 seconds per request. The question is a label; all four requests represent equal work.</p><p>The first lesson holds the batch limit at four and compares no deliberate wait with a wait of up to one second. New arrivals still queue when the server is busy. The batch-size experiment fixes simultaneous arrivals and no deliberate wait, then changes only the batch limit.</p><p>Real performance depends on the model, input length, hardware, and load. Smaller batches don't guarantee a faster result for everyone.</p><a href="https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/batcher.html" target="_blank" rel="noreferrer">NVIDIA's guide to batching and waiting windows <ArrowUpRight size={14} /></a></details>
      </section>
    </main>

    <footer className="lesson-footer"><span>batch. <span>A small look behind AI</span></span><span>Educational simulation · Not a benchmark</span></footer>

    {sourcesOpen && <dialog ref={dialog} aria-labelledby="lesson-about-title" className="lesson-dialog" onClose={() => setSourcesOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setSourcesOpen(false); } }}><button autoFocus className="lesson-icon-button lesson-dialog-close" aria-label="Close lesson information" onClick={() => setSourcesOpen(false)}><X size={20} /></button><Layers3 size={30} /><h2 id="lesson-about-title">One idea at a time.</h2><p>Follow a request to see how a server groups work into batches, and how waiting changes the outcome.</p><p>This is a replayable teaching model. It doesn't call an AI service or reproduce a product's private implementation. Caching, hardware, and more complex scheduling are outside this lesson.</p><button className="lesson-primary" onClick={() => setSourcesOpen(false)}>Back to the lesson <ArrowRight size={16} /></button></dialog>}
  </div>;
}
