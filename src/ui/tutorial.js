import * as THREE from 'three';
import { TRAINING } from '../sim/hunts.js';

const FIRST = 'ashford-ws1';
const WEB = 'hq-web';

// The guided Training Hunt. Each lesson can hold the Hunt timeline, point at a node,
// highlight a control, allow only one action, and advance when its condition is met.
// Lessons:
//   title, body          coach card text (body may be a function of the app state)
//   enter(ctx)           runs once when the lesson starts
//   done(ctx)            polled every frame; true advances to the next lesson
//   next                 label for a Next button (for lessons that are just reading)
//   focus                CSS selector of a control to highlight
//   marker               node id to point the bouncing arrow at
//   allow                the one dossier action that is enabled, if any
const LESSONS = [
  {
    title: 'Welcome, Vulture',
    body: 'In about two minutes you will learn the whole watch: spot the rot, open a dossier, isolate, restore, trace and block. The Hunt waits for you whenever it is your move.',
    next: 'Start training',
  },
  {
    title: 'Look around',
    body: 'Drag to orbit the map. Right-drag (two fingers on touch) to pan, scroll or pinch to zoom. HQ sits in the middle; six branch offices ring it.',
    next: 'Got it',
  },
  {
    title: 'Something smells wrong',
    body: 'A workstation in Ashford Branch is pulsing amber. Amber means Scented: suspicious. Click it to open its dossier.',
    marker: FIRST,
    enter: ({ engine, flyTo }) => {
      engine.start({ ...TRAINING, ...TRAINING.build() });
      engine.holdAt(1.5);
      flyTo(FIRST);
    },
    done: ({ dossier }) => dossier.nodeId === FIRST,
  },
  {
    title: 'The dossier',
    body: 'Every node has a case file: hostname, IP, OS, its state and recent events. Your four actions live here. Now watch the workstation closely…',
    marker: FIRST,
    focus: '.dossier-facts',
    enter: ({ engine }) => engine.holdAt(4.6),
    done: ({ engine }) => engine.held && engine.stateOf(FIRST) === 'rotting',
  },
  {
    title: 'It turned',
    body: 'Crimson means Rotting: compromised. The vultures are gathering, and it will spread through its router next. Press Isolate to quarantine it.',
    marker: FIRST,
    focus: '[data-action="isolate"]',
    allow: 'isolate',
    enter: ({ select }) => select(FIRST),
    done: ({ engine }) => engine.stateOf(FIRST) === 'picked',
  },
  {
    title: 'Caged, but still sick',
    body: 'Picked Clean (ash gray, caged) stops anything passing through it. Its links went dark. But the infection is still inside. Press Restore to clean it; it takes 5 seconds.',
    marker: FIRST,
    focus: '[data-action="restore"]',
    allow: 'restore',
    enter: ({ engine, select }) => {
      engine.clearCooldowns();
      select(FIRST);
    },
    done: ({ engine }) => ['revived', 'alive'].includes(engine.stateOf(FIRST)),
  },
  {
    title: 'Clean',
    body: 'Revived: restored. The vultures scatter. The spread it was planning never happened. Keep your eyes on HQ in the middle of the map…',
    marker: WEB,
    enter: ({ engine, flyTo, select }) => {
      select(null);
      engine.holdAt(14.6);
      setTimeout(() => flyTo(WEB), 1200);
    },
    done: ({ engine }) => engine.held && engine.stateOf(WEB) === 'rotting',
  },
  {
    title: 'A siege from outside',
    body: 'A swarm from off the map broke the HQ web server. Before you clean it, find out how it got in. Press Trace.',
    marker: WEB,
    focus: '[data-action="trace"]',
    allow: 'trace',
    enter: ({ engine, select }) => {
      engine.clearCooldowns();
      select(WEB);
    },
    done: ({ engine }) => engine.log.some((e) => e.message.startsWith('Trace on hq-web')),
  },
  {
    title: 'Shut the gate',
    body: 'The crimson trail runs off the map. That is the outside source. Press Block to put it on the firewall blocklist; its traffic will bounce off.',
    marker: WEB,
    focus: '[data-action="block"]',
    allow: 'block',
    enter: ({ select }) => select(WEB),
    done: ({ engine }) => engine.blocked,
  },
  {
    title: 'Now clean it up',
    body: 'The flood is bouncing off the firewall. Press Restore on the web server.',
    marker: WEB,
    focus: '[data-action="restore"]',
    allow: 'restore',
    enter: ({ engine, select }) => {
      engine.clearCooldowns();
      select(WEB);
    },
    done: ({ engine }) => ['revived', 'alive'].includes(engine.stateOf(WEB)),
  },
  {
    title: 'Everything is on record',
    body: 'The Watch logs every event, tagged INFO, WARN or CRIT. Search it, filter it, and click any row to fly to that node.',
    focus: '#watch',
    next: 'Next',
  },
  {
    title: 'Control time',
    body: 'Pause with Space, or run the Hunt at 0.5×, 1× or 2×. Double-click any node to swoop down to it. Every action has a cooldown, so pick your moves.',
    focus: '#transport',
    next: 'Finish the Hunt',
  },
  {
    title: 'Closing the case',
    body: 'Letting the Hunt run out. Every round ends with a Case File…',
    enter: ({ engine, select, transport }) => {
      select(null);
      engine.releaseHold();
      transport.setSpeed(2);
    },
    done: ({ caseFileOpen }) => caseFileOpen(),
  },
];

export function createTutorial(app) {
  const card = document.getElementById('coach');
  const marker = document.getElementById('tut-marker');
  const els = {
    step: card.querySelector('.coach-step'),
    title: card.querySelector('.coach-title'),
    body: card.querySelector('.coach-body'),
    next: card.querySelector('.coach-next'),
    skip: card.querySelector('.coach-skip'),
  };
  let index = -1;
  let active = false;
  let focused = null;
  const v = new THREE.Vector3();

  const lesson = () => LESSONS[index];

  function show(i) {
    index = i;
    const l = lesson();
    els.step.textContent = `Training · ${i + 1} of ${LESSONS.length}`;
    els.title.textContent = l.title;
    els.body.textContent = l.body;
    els.next.hidden = !l.next;
    els.next.textContent = l.next ?? '';
    card.classList.remove('coach-pop');
    void card.offsetWidth; // restart the entrance animation
    card.classList.add('coach-pop');
    l.enter?.(app);
  }

  function setFocus(selector) {
    const el = selector ? document.querySelector(selector) : null;
    if (el === focused) return;
    focused?.classList.remove('tut-focus');
    focused = el;
    focused?.classList.add('tut-focus');
  }

  function placeMarker(nodeId) {
    const entry = nodeId && app.nodes.byId.get(nodeId);
    if (!entry) {
      marker.hidden = true;
      return;
    }
    v.copy(entry.port).setY(entry.top + 0.3).project(app.stage.camera);
    const onScreen = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    marker.hidden = !onScreen;
    if (!onScreen) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    marker.style.transform = `translate(${x}px, ${y}px)`;
  }

  function finish(completed) {
    active = false;
    card.hidden = true;
    marker.hidden = true;
    setFocus(null);
    app.engine.releaseHold();
    app.transport.setSpeed(1);
    app.setTraining(false);
    if (!completed) app.engine.reset();
    app.onFinish(completed);
  }

  els.next.addEventListener('click', () => {
    if (index === LESSONS.length - 1) return;
    show(index + 1);
  });
  els.skip.addEventListener('click', () => finish(false));

  return {
    get active() {
      return active;
    },

    start() {
      if (active) return;
      active = true;
      app.engine.reset();
      app.setTraining(true);
      card.hidden = false;
      show(0);
    },

    // Only the lesson's action is enabled while training.
    allows(action) {
      return !active || lesson()?.allow === action;
    },

    stop: () => active && finish(false),

    update() {
      if (!active) return;
      const l = lesson();
      // Re-applied every frame: the dossier re-renders its buttons as state changes.
      // A lesson that needs a dossier action reopens the dossier if it was closed.
      if (l.allow && app.dossier.nodeId !== l.marker) app.select(l.marker);
      setFocus(l.focus);
      placeMarker(l.marker);
      if (l.done?.(app)) {
        if (index === LESSONS.length - 1) finish(true);
        else show(index + 1);
      }
    },
  };
}
