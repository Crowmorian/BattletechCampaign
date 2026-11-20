const storageKey = 'battletech-player-sheet-v1';
const previewStatus = 'Local preview · Changes are saved in this browser.';
const criticalSystems = [
  { key: 'engine', label: 'Engine', limit: 1, effect: '+1 Heat when firing weapons' },
  { key: 'fireControl', label: 'Fire Control', limit: 4, effect: '+2 To-Hit each' },
  { key: 'mp', label: 'MP', limit: 4, effect: '½ MV each' },
  { key: 'weapons', label: 'Weapons', limit: 4, effect: '−1 Damage each' },
];
const legacyCriticalSystems = new Map([
  ['Engine', 'engine'], ['Sensors', 'fireControl'], ['Movement', 'mp'], ['Weapons', 'weapons'],
]);
const unitTypes = { mech: 'BattleMech', vehicle: 'Vehicle', air: 'Air unit' };

function sampleUnit(id, chassis, variant, armorTotal, armorRemaining, structureTotal,
  structureRemaining, criticalHits = {}, inoperable = false) {
  return { id, chassis, variant, type: 'mech', armorTotal, armorRemaining,
    structureTotal, structureRemaining, criticalHits, inoperable };
}

const preview = {
  active: 'rook',
  rosters: {
    rook: {
      name: 'Rook Company', supply: 18,
      units: [
        sampleUnit('rook-1', 'Hunchback', 'HBK-4G', 14, 14, 10, 10),
        sampleUnit('rook-2', 'Shadow Hawk', 'SHD-2H', 13, 8, 10, 8, { fireControl: 2, weapons: 1 }),
        sampleUnit('rook-3', 'Locust', 'LCT-1V', 12, 2, 6, 1, { engine: 1, mp: 2 }, true),
      ],
    },
    kestrel: {
      name: 'Kestrel Lance', supply: 14,
      units: [sampleUnit('kestrel-1', 'Centurion', 'CN9-A', 13, 13, 10, 10)],
    },
  },
};

const byId = (id) => document.getElementById(id);
const saveStatus = byId('save-status');
const sheet = byId('sheet');
const supply = byId('supply');
const accountButton = byId('account-button');
const accountDialog = byId('account-dialog');
const unitList = byId('unit-list');
const unitTemplate = byId('unit-template');
const criticalTemplate = byId('critical-row-template');
const criticalOptions = byId('critical-options');
const unitDialog = byId('unit-dialog');
const unitForm = byId('unit-form');
const fields = unitForm.elements;
const damageSteppers = [...unitForm.querySelectorAll('.number-stepper')].map((stepper) => ({
  input: stepper.querySelector('input'),
  minus: stepper.querySelector('[data-step="-1"]'),
  plus: stepper.querySelector('[data-step="1"]'),
}));
const addUnit = byId('add-unit');
const removeUnit = byId('remove-unit');
const removeDialog = byId('remove-dialog');
const trackNames = ['armor', 'structure'];

let state = readPreview();
let editingId = null;
let criticalDraft = {};

function readPreview() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.rosters?.rook && saved.rosters.kestrel) {
      for (const roster of Object.values(saved.rosters)) {
        for (const unit of roster.units) migrateCriticalHits(unit);
      }
      return saved;
    }
  } catch {
    // An unavailable or unreadable store can still use the sample rosters.
  }
  return preview;
}

function migrateCriticalHits(unit) {
  if (!Array.isArray(unit.criticalHits)) return;
  const hits = {};
  const legacy = [];
  for (const label of unit.criticalHits) {
    const key = legacyCriticalSystems.get(label);
    if (key) hits[key] = 1;
    else legacy.push(label);
  }
  unit.criticalHits = hits;
  if (legacy.length) unit.legacyCriticalHits = legacy;
}

function save(message) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    saveStatus.textContent = `${message} ${previewStatus}`;
  } catch {
    saveStatus.textContent = `${message} Browser storage is unavailable. Changes last until you close or reload the page.`;
  }
}

function activeRoster() {
  return state.rosters[state.active];
}

function renderSheet() {
  const roster = activeRoster();
  sheet.hidden = !roster;
  byId('signed-out').hidden = Boolean(roster);
  accountButton.textContent = roster ? 'Sign out' : 'Sign in';
  if (roster) {
    byId('group-name').textContent = roster.name;
    supply.value = roster.supply;
    renderUnits();
  }
}

function renderRosterCount() {
  const { units } = activeRoster();
  const available = units.filter((unit) => !unit.inoperable).length;
  const unitLabel = units.length === 1 ? 'unit' : 'units';
  byId('roster-count').textContent = `${units.length} ${unitLabel} · ${available} available`;
  byId('empty-roster').hidden = units.length > 0;
}

function renderUnits() {
  unitList.replaceChildren(...activeRoster().units.map(renderCard));
  renderRosterCount();
}

function renderCard(unit) {
  const card = unitTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.unitId = unit.id;
  card.classList.toggle('inoperable', unit.inoperable);
  const icon = card.querySelector('.unit-icon');
  icon.alt = unitTypes[unit.type];
  icon.src = `Assets/${unit.type}_icon.png`;
  card.querySelector('h3').textContent = unit.chassis;
  card.querySelector('.unit-variant').textContent = unit.variant;

  for (const name of trackNames) {
    const total = unit[`${name}Total`];
    const remaining = unit[`${name}Remaining`];
    const track = card.querySelector(`.${name}`);
    const count = track.querySelector('.track-count');
    count.textContent = `${remaining} / ${total}`;
    count.setAttribute('aria-label', `${remaining} of ${total} intact`);
    const pips = track.querySelector('.pips');
    for (let index = 0; index < total; index += 1) {
      const pip = document.createElement('span');
      pip.className = index < remaining ? 'pip intact' : 'pip';
      pips.append(pip);
    }
  }

  renderCriticalRows(card.querySelector('.critical-list'), unit.criticalHits);
  showLegacyCriticals(card, unit.legacyCriticalHits);

  const inoperable = card.querySelector('input');
  inoperable.checked = unit.inoperable;
  inoperable.setAttribute('aria-label', `Inoperable: ${unit.chassis} ${unit.variant}`);
  inoperable.addEventListener('change', () => {
    unit.inoperable = inoperable.checked;
    card.classList.toggle('inoperable', unit.inoperable);
    renderRosterCount();
    save(`${unit.chassis} status updated.`);
  });

  const edit = card.querySelector('.card-actions button');
  edit.setAttribute('aria-label', `Edit ${unit.chassis} ${unit.variant}`);
  edit.addEventListener('click', () => openEditor(unit));
  return card;
}

function renderCriticalRows(list, hits, editable = false) {
  const rows = criticalSystems.map(({ key, label, limit, effect }) => {
    const row = criticalTemplate.content.firstElementChild.cloneNode(true);
    const readout = row.querySelector('.critical-count');
    const pips = row.querySelector('.critical-pips');
    const minus = row.querySelector('.critical-minus');
    const plus = row.querySelector('.critical-plus');
    row.querySelector('.critical-name').textContent = label;
    row.querySelector('.critical-effect').textContent = effect;
    for (let index = 0; index < limit; index += 1) {
      const pip = document.createElement('span');
      pip.className = 'critical-pip';
      pips.append(pip);
    }

    function update() {
      const count = hits[key] ?? 0;
      readout.textContent = `${label}: ${count} of ${limit} hits`;
      row.classList.toggle('has-hits', count > 0);
      Array.from(pips.children).forEach((pip, index) => {
        pip.classList.toggle('filled', index < count);
      });
      if (editable) {
        minus.setAttribute('aria-disabled', String(count === 0));
        plus.setAttribute('aria-disabled', String(count === limit));
      }
    }

    if (editable) {
      readout.setAttribute('role', 'status');
      for (const [button, delta, action] of [[minus, -1, 'Remove'], [plus, 1, 'Add']]) {
        button.hidden = false;
        button.setAttribute('aria-label', `${action} ${label} hit`);
        button.addEventListener('click', () => {
          if (button.getAttribute('aria-disabled') === 'true') return;
          hits[key] = (hits[key] ?? 0) + delta;
          update();
        });
      }
    }

    update();
    return row;
  });
  list.replaceChildren(...rows);
}

function showLegacyCriticals(container, hits = []) {
  const note = container.querySelector('.legacy-criticals');
  note.hidden = hits.length === 0;
  note.textContent = hits.length ? `Earlier entries: ${hits.join(', ')}` : '';
}

function openEditor(unit) {
  unitForm.reset();
  editingId = unit?.id ?? null;
  byId('editor-title').textContent = unit ? 'Edit unit' : 'Add unit';
  removeUnit.hidden = !unit;
  for (const name of ['chassis', 'variant', 'type']) {
    fields.namedItem(name).value = unit?.[name] ?? (name === 'type' ? 'mech' : '');
  }
  for (const name of trackNames) {
    fields.namedItem(`${name}Total`).value = unit?.[`${name}Total`] ?? '';
    fields.namedItem(`${name}Remaining`).value = unit?.[`${name}Remaining`] ?? '';
  }
  fields.inoperable.checked = unit?.inoperable ?? false;
  criticalDraft = { ...unit?.criticalHits };
  renderCriticalRows(criticalOptions, criticalDraft, true);
  showLegacyCriticals(unitForm, unit?.legacyCriticalHits);
  updateEditorValidity();
  unitDialog.showModal();
  fields.chassis.focus();
}

function updateEditorValidity() {
  for (const name of trackNames) {
    const total = fields.namedItem(`${name}Total`);
    const remaining = fields.namedItem(`${name}Remaining`);
    remaining.max = total.value;
    const tooHigh = !Number.isNaN(total.valueAsNumber) && remaining.valueAsNumber > total.valueAsNumber;
    remaining.setCustomValidity(tooHigh ? `Remaining ${name} must be at most ${total.value}.` : '');
  }
  for (const { input, minus, plus } of damageSteppers) {
    const value = input.valueAsNumber;
    const max = input.max === '' ? Infinity : Number(input.max);
    minus.setAttribute('aria-disabled', String(Number.isNaN(value) || value <= Number(input.min)));
    plus.setAttribute('aria-disabled', String((value || 0) >= max));
  }
  for (const name of ['chassis', 'variant']) {
    const field = fields.namedItem(name);
    field.setCustomValidity(field.value && !field.value.trim() ? 'Enter a value.' : '');
  }
}

for (const { input, minus, plus } of damageSteppers) {
  for (const [button, step] of [[minus, 'stepDown'], [plus, 'stepUp']]) {
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      input[step]();
      updateEditorValidity();
    });
  }
}

function openAccountPicker() {
  accountDialog.showModal();
}

for (const [key, roster] of Object.entries(state.rosters)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = roster.name;
  button.addEventListener('click', () => {
    state.active = key;
    renderSheet();
    accountDialog.close();
    accountButton.focus();
    save(`${roster.name} opened.`);
  });
  byId('account-options').append(button);
}

byId('rules-button').addEventListener('click', () => byId('rules-dialog').showModal());
byId('open-account').addEventListener('click', openAccountPicker);
accountButton.addEventListener('click', () => {
  if (activeRoster()) {
    state.active = null;
    renderSheet();
    save('Preview signed out.');
  } else {
    openAccountPicker();
  }
});

byId('supply-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const balance = supply.valueAsNumber;
  if (!Number.isSafeInteger(balance)) {
    supply.setCustomValidity('Enter a whole number within the supported range.');
    supply.reportValidity();
    return;
  }
  activeRoster().supply = balance;
  save('Supply points updated.');
});
supply.addEventListener('input', () => supply.setCustomValidity(''));

addUnit.addEventListener('click', () => openEditor());
byId('cancel-editor').addEventListener('click', () => unitDialog.close());
unitForm.addEventListener('input', updateEditorValidity);
unitForm.addEventListener('submit', (event) => {
  event.preventDefault();
  updateEditorValidity();
  if (!unitForm.reportValidity()) return;

  const data = new FormData(unitForm);
  const units = activeRoster().units;
  const unitIndex = units.findIndex((entry) => entry.id === editingId);
  const existing = units[unitIndex];
  const id = existing?.id ?? `unit-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
  const unit = {
    ...existing,
    id,
    chassis: data.get('chassis').trim(),
    variant: data.get('variant').trim(),
    type: data.get('type'),
    armorTotal: Number(data.get('armorTotal')),
    armorRemaining: Number(data.get('armorRemaining')),
    structureTotal: Number(data.get('structureTotal')),
    structureRemaining: Number(data.get('structureRemaining')),
    criticalHits: criticalDraft,
    inoperable: data.has('inoperable'),
  };
  if (existing) {
    units[unitIndex] = unit;
  } else {
    units.push(unit);
  }
  unitDialog.close();
  renderUnits();
  const card = Array.from(unitList.children).find((entry) => entry.dataset.unitId === id);
  card.querySelector('.card-actions button').focus();
  save(`${unit.chassis} saved.`);
});

removeUnit.addEventListener('click', () => {
  const unit = activeRoster().units.find((entry) => entry.id === editingId);
  byId('remove-description').textContent = `Remove ${unit.chassis} ${unit.variant} from this roster?`;
  removeDialog.returnValue = '';
  removeDialog.showModal();
});

removeDialog.addEventListener('close', () => {
  if (removeDialog.returnValue !== 'remove') return;
  const roster = activeRoster();
  roster.units = roster.units.filter((unit) => unit.id !== editingId);
  unitDialog.close();
  renderUnits();
  addUnit.focus();
  save('Unit removed.');
});

renderSheet();
