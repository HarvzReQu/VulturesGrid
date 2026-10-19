// Records a round's visual events (state changes, pulses, streams, stages) with their
// Hunt time, then answers "what did the map look like at time t?" for the timeline scrubber.
const RECORDED = new Set(['state', 'spread', 'stream-start', 'stream-stop', 'stage']);

export function createReplay(nodeIds) {
  let events = [];
  let stageStarts = [];
  let duration = 0;

  const replay = {
    active: false,
    playing: false,
    playhead: 0,

    get duration() {
      return duration;
    },

    records: (type) => RECORDED.has(type),

    record(event, time) {
      events.push({ ...event, time });
    },

    clear() {
      events = [];
      stageStarts = [];
      duration = 0;
      replay.active = replay.playing = false;
      replay.playhead = 0;
    },

    finish(huntDuration) {
      duration = huntDuration;
      stageStarts = [];
      for (const e of events) if (e.type === 'stage' && stageStarts[e.index] === undefined) stageStarts[e.index] = e.time;
    },

    statesAt(t) {
      const states = new Map(nodeIds.map((id) => [id, 'alive']));
      for (const e of events) {
        if (e.time > t) break;
        if (e.type === 'state') states.set(e.id, e.state);
      }
      return states;
    },

    streamsAt(t) {
      const active = new Map();
      for (const e of events) {
        if (e.time > t) break;
        if (e.type === 'stream-start') active.set(e.id, e);
        else if (e.type === 'stream-stop') active.delete(e.id);
      }
      return [...active.values()];
    },

    // Events in (from, to], for forward playback.
    between(from, to) {
      return events.filter((e) => e.time > from && e.time <= to);
    },

    // Same shape the kill chain reads from the live engine.
    chainView: {
      get running() {
        return replay.playing;
      },
      get stageIndex() {
        let index = -1;
        stageStarts.forEach((start, i) => start !== undefined && start <= replay.playhead && (index = i));
        return index;
      },
      stageProgress(i) {
        const start = stageStarts[i];
        if (start === undefined || replay.playhead < start) return 0;
        const end = stageStarts[i + 1] ?? duration;
        return Math.min(1, (replay.playhead - start) / Math.max(0.001, end - start));
      },
    },
  };
  return replay;
}
