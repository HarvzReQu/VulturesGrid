// Node states: themed name plus plain meaning, always shown together in the UI.
export const STATES = {
  alive: { name: 'Alive', plain: 'Healthy' },
  scented: { name: 'Scented', plain: 'Suspicious' },
  rotting: { name: 'Rotting', plain: 'Compromised' },
  picked: { name: 'Picked Clean', plain: 'Quarantined' },
  revived: { name: 'Revived', plain: 'Restored' },
};

export const stateLabel = (state) => `${STATES[state].name} / ${STATES[state].plain}`;
