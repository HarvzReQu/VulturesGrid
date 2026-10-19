// Pure data description of the map: nodes, their layout, and the lines between them.
// Hostnames and IPs are made up and only used as labels.

const TAU = Math.PI * 2;
export const BRANCH_RADIUS = 26;

// Off-map point representing "the outside": where Siege traffic comes from and Bleed traffic goes.
export const OUTSIDE_ID = '@outside';
const FW_ANGLE = -Math.PI / 3; // HQ firewall faces the gap between two branches
const OUTSIDE_POSITION = [Math.cos(FW_ANGLE) * 95, 20, Math.sin(FW_ANGLE) * 95];

const BRANCHES = ['Ashford', 'Bramble', 'Cinder', 'Dunmore', 'Elmstead', 'Fenwick'];

const HQ_RING = [
  { key: 'fw', type: 'firewall', label: 'HQ Firewall', hostname: 'hq-fw01', os: 'Bonewall FW 4.2' },
  { key: 'web', type: 'server', label: 'Web Server', hostname: 'hq-web01', os: 'Debian 12 · nginx' },
  { key: 'dc', type: 'server', label: 'Domain Controller', hostname: 'hq-dc01', os: 'Windows Server 2022' },
  { key: 'files', type: 'server', label: 'File Server', hostname: 'hq-fs01', os: 'Windows Server 2019' },
  { key: 'db', type: 'server', label: 'Database Server', hostname: 'hq-db01', os: 'Ubuntu 22.04 · PostgreSQL' },
];

// Fictional OS labels for the dossier.
const OS = { router: 'Carrion RouterOS 7.1', firewall: 'Bonewall FW 4.2', workstation: 'Windows 11 23H2' };

// Small deterministic PRNG so the map is identical on every load.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTopology(seed = 7) {
  const rand = mulberry32(seed);
  const nodes = [];
  const links = [];
  const byId = new Map();

  const addNode = (node) => {
    node.facing ??= 0;
    node.os ??= OS[node.type];
    node.role ??= node.type; // drives the 3D shape: web, db, dc, files, core, router, firewall, workstation
    nodes.push(node);
    byId.set(node.id, node);
    return node;
  };
  const addLink = (a, b, kind = 'lan') => links.push({ id: `${a.id}~${b.id}`, from: a.id, to: b.id, kind });
  const face = (node, [tx, , tz]) => {
    node.facing = Math.atan2(tx - node.position[0], tz - node.position[2]);
  };

  // HQ: core router in the middle, five nodes around it.
  const core = addNode({
    id: 'hq-core',
    cluster: 'hq',
    site: 'HQ Data Center',
    type: 'router',
    label: 'Core Router',
    hostname: 'hq-core-rtr01',
    role: 'core',
    ip: '10.0.0.1',
    os: OS.router,
    position: [0, 0, 0],
  });

  const hq = {};
  HQ_RING.forEach((spec, i) => {
    const angle = (i / HQ_RING.length) * TAU + FW_ANGLE;
    const node = addNode({
      id: `hq-${spec.key}`,
      cluster: 'hq',
    site: 'HQ Data Center',
      type: spec.type,
      label: spec.label,
      hostname: spec.hostname,
      os: spec.os,
      role: spec.key === 'fw' ? 'firewall' : spec.key,
      ip: `10.0.0.${10 + i}`,
      position: [Math.cos(angle) * 6.5, 0, Math.sin(angle) * 6.5],
    });
    face(node, core.position);
    hq[spec.key] = node;
  });

  const outside = { id: OUTSIDE_ID, position: OUTSIDE_POSITION };
  addLink(outside, hq.fw, 'ext');
  addLink(core, hq.fw);
  addLink(hq.fw, hq.web);
  addLink(core, hq.dc);
  addLink(core, hq.files);
  addLink(core, hq.db);

  // Branches in a ring: firewall facing HQ, router at the center, workstations behind.
  BRANCHES.forEach((name, b) => {
    const site = `${name} Branch`;
    const angle = (b / BRANCHES.length) * TAU + TAU / 12;
    const cx = Math.cos(angle) * BRANCH_RADIUS;
    const cz = Math.sin(angle) * BRANCH_RADIUS;
    const cluster = name.toLowerCase();
    const prefix = cluster.slice(0, 3);
    const subnet = b + 1;

    const fw = addNode({
      id: `${cluster}-fw`,
      cluster,
      site,
      type: 'firewall',
      label: `${name} Firewall`,
      hostname: `${prefix}-fw01`,
      ip: `10.${subnet}.0.1`,
      position: [cx - Math.cos(angle) * 4.5, 0, cz - Math.sin(angle) * 4.5],
    });
    face(fw, core.position);

    const rtr = addNode({
      id: `${cluster}-rtr`,
      cluster,
      site,
      type: 'router',
      label: `${name} Router`,
      hostname: `${prefix}-rtr01`,
      ip: `10.${subnet}.0.2`,
      position: [cx, 0, cz],
    });

    addLink(core, fw, 'wan');
    addLink(fw, rtr);

    const count = 3 + Math.floor(rand() * 3); // 3-5 workstations -> 5-7 nodes per branch
    for (let k = 0; k < count; k++) {
      const a = angle + (k - (count - 1) / 2) * 0.55;
      const ws = addNode({
        id: `${cluster}-ws${k + 1}`,
        cluster,
        site,
        type: 'workstation',
        label: `${name} Workstation ${k + 1}`,
        hostname: `${prefix}-ws${String(k + 1).padStart(2, '0')}`,
        ip: `10.${subnet}.1.${20 + k}`,
        position: [cx + Math.cos(a) * 4.4, 0, cz + Math.sin(a) * 4.4],
      });
      face(ws, rtr.position);
      addLink(rtr, ws);
    }
  });

  return { nodes, links, byId, outside };
}
