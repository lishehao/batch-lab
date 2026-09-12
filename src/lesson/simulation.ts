export type Experiment = "waiting" | "size";
export type Strategy = "quick" | "together";
export type Traffic = "staggered" | "simultaneous";
export type RequestState = "pending" | "queued" | "computing" | "done";

export interface LessonRequest {
  id: string;
  arrival: number;
  start: number;
  end: number;
  batch: number;
}

export interface LessonBatch {
  id: number;
  requestIds: string[];
  start: number;
  end: number;
}

export interface LessonRun {
  experiment: Experiment;
  strategy: Strategy;
  traffic: Traffic;
  capacity: number;
  delay: number;
  requests: LessonRequest[];
  batches: LessonBatch[];
  duration: number;
}

// Deliberately illustrative service costs, not measured model performance.
export const teachingComputeTime = (size: number) => 1900 + size * 300;

export function buildLessonRun(
  experiment: Experiment,
  strategy: Strategy,
  traffic: Traffic = "staggered",
): LessonRun {
  const capacity = experiment === "size" && strategy === "quick" ? 1 : 4;
  const delay = experiment === "waiting" && strategy === "together" ? 1000 : 0;
  const arrivals = experiment === "size" || traffic === "simultaneous"
    ? [0, 0, 0, 0] : [0, 400, 700, 1000];
  const pending = arrivals.map((arrival, index) => ({ id: "ABCD"[index], arrival }));
  const requests: LessonRequest[] = [];
  const batches: LessonBatch[] = [];
  let time = 0;

  while (pending.length) {
    time = Math.max(time, pending[0].arrival);
    const deadline = pending[0].arrival + delay;
    let ready = pending.filter(request => request.arrival <= time).length;
    while (ready < capacity && time < deadline) {
      time = Math.min(pending[ready]?.arrival ?? deadline, deadline);
      ready = pending.filter(request => request.arrival <= time).length;
    }
    const group = pending.splice(0, Math.min(ready, capacity));
    const end = time + teachingComputeTime(group.length);
    const batch = batches.length;
    batches.push({ id: batch, requestIds: group.map(request => request.id), start: time, end });
    requests.push(...group.map(request => ({ ...request, start: time, end, batch })));
    time = end;
  }
  return { experiment, strategy, traffic, capacity, delay, requests, batches, duration: time };
}

export function requestStateAt(request: LessonRequest, time: number): RequestState {
  if (time < request.arrival) return "pending";
  if (time < request.start) return "queued";
  if (time < request.end) return "computing";
  return "done";
}

export function lessonSnapshot(run: LessonRun, time: number) {
  const requests = run.requests.map(request => ({ ...request, state: requestStateAt(request, time) }));
  return {
    requests,
    queued: requests.filter(request => request.state === "queued"),
    computing: requests.filter(request => request.state === "computing"),
    done: requests.filter(request => request.state === "done"),
    activeBatch: run.batches.find(batch => time >= batch.start && time < batch.end),
  };
}

export const teachingSeconds = (time: number) => `${(time / 1000).toFixed(1)}`;
