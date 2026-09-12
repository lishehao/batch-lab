import { describe, expect, it } from "vitest";
import { buildLessonRun, lessonSnapshot, teachingComputeTime } from "./simulation";

describe("transparent batch lesson", () => {
  it("launches A immediately, then batches the requests accumulated while busy", () => {
    const run = buildLessonRun("waiting", "quick");
    expect(run.batches.map(batch => batch.requestIds)).toEqual([["A"], ["B", "C", "D"]]);
    expect(run.requests[0].end).toBe(2200);
    expect(run.duration).toBe(5000);
  });
  it("waits within a bounded window, trading A's response for a lower total time", () => {
    const run = buildLessonRun("waiting", "together");
    expect(run.batches[0].start).toBe(1000);
    expect(run.duration).toBe(4100);
    expect(run.requests.every(request => request.end === 4100)).toBe(true);
    expect(run.capacity).toBe(buildLessonRun("waiting", "quick").capacity);
  });
  it("does not add artificial wait when a full batch is already available", () => {
    for (const strategy of ["quick", "together"] as const) {
      const run = buildLessonRun("waiting", strategy, "simultaneous");
      expect(run.batches[0].start).toBe(0);
      expect(run.duration).toBe(3100);
    }
  });
  it("isolates batch size from waiting-window changes", () => {
    const small = buildLessonRun("size", "quick");
    const large = buildLessonRun("size", "together");
    expect(small.delay).toBe(large.delay);
    expect(small.requests.map(request => request.arrival)).toEqual(large.requests.map(request => request.arrival));
    expect(small.duration).toBe(8800);
    expect(large.duration).toBe(3100);
    expect(small.requests[0].end).toBeLessThan(large.requests[0].end);
  });
  it("has clear boundary states and never emits a result before computation", () => {
    const run = buildLessonRun("waiting", "together");
    expect(lessonSnapshot(run, 0).queued.map(request => request.id)).toEqual(["A"]);
    expect(lessonSnapshot(run, 999).done).toHaveLength(0);
    expect(lessonSnapshot(run, 1000).computing).toHaveLength(4);
    expect(lessonSnapshot(run, 4100).done).toHaveLength(4);
  });
  it("is deterministic and accounts for each request exactly once", () => {
    for (const experiment of ["waiting", "size"] as const) {
      for (const strategy of ["quick", "together"] as const) {
        const run = buildLessonRun(experiment, strategy);
        expect(run).toEqual(buildLessonRun(experiment, strategy));
        expect(new Set(run.requests.map(request => request.id)).size).toBe(4);
        expect(run.batches.flatMap(batch => batch.requestIds).sort()).toEqual(["A", "B", "C", "D"]);
        expect(run.batches.every(batch => batch.end - batch.start === teachingComputeTime(batch.requestIds.length))).toBe(true);
      }
    }
  });
});
