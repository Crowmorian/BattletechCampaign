const storageKey = 'battletech-player-sheet-v1';
const previewStatus = 'Local preview · Changes are saved in this browser.';
const criticalSystems = ['Engine', 'Gyro', 'Sensors', 'Life support', 'Weapons', 'Ammo', 'Movement'];
const unitTypes = { mech: 'BattleMech', vehicle: 'Vehicle', air: 'Air unit' };

function sampleUnit(id, chassis, variant, armorTotal, armorRemaining, structureTotal,
  structureRemaining, criticalHits = [], inoperable = false) {
  return { id, chassis, variant, type: 'mech', armorTotal, armorRemaining,
    structureTotal, structureRemaining, criticalHits, inoperable };
}

const preview = {
  active: 'rook',
  rosters: {
    rook: {
      name: 'Rook Company', supply: 18,
      units: [
        sampleUnit('rook-1', 'Hunchback', 'HBK-4G', 20, 20, 10, 10),
        sampleUnit('rook-2', 'Shadow Hawk', 'SHD-2H', 18, 11, 10, 8, ['Sensors', 'Weapons']),
        sampleUnit('rook-3', 'Locust', 'LCT-1V', 12, 2, 6, 1, ['Engine', 'Movement'], true),
      ],
    },
    kestrel: {
      name: 'Kestrel Lance', supply: 14,
      units: [sampleUnit('kestrel-1', 'Centurion', 'CN9-A', 18, 18, 10, 10)],
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
const unitDialog = byId('unit-dialog');
const unitForm = byId('unit-form');
const fields = unitForm.elements;
const addUnit = byId('add-unit');
const removeUnit = byId('remove-unit');
const removeDialog = byId('remove-dialog');
const trackNames = ['armor', 'structure'];

let state = readPreview();
let editingId = null;

function readPreview() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.rosters?.rook && saved.rosters.kestrel) return saved;
  } catch {
    // An unavailable or unreadable store can still use the sample rosters.
  }
  return preview;
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
  card.dataset.type = unit.type;
  card.classList.toggle('inoperable', unit.inoperable);
  card.querySelector('.unit-art').setAttribute('aria-label', unitTypes[unit.type]);
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

  const criticalList = card.querySelector('.critical-list');
  criticalList.hidden = unit.criticalHits.length === 0;
  card.querySelector('.no-criticals').hidden = unit.criticalHits.length > 0;
  for (const name of unit.criticalHits) {
    const item = document.createElement('li');
    item.textContent = name;
    criticalList.append(item);
  }

  const inoperable = card.querySelector('input');
  inoperable.checked = unit.inoperable;
  inoperable.setAttribute('aria-label', `Inoperable: ${unit.chassis} ${unit.variant}`);
  inoperable.addEventListener('change', () => {
    unit.inoperable = inoperable.checked;
    card.classList.toggle('inoperable', unit.inoperable);
    renderRosterCount();
    save(`${unit.chassis} status updated.`);
  });

  const edit = card.querySelector('button');
  edit.setAttribute('aria-label', `Edit ${unit.chassis} ${unit.variant}`);
  edit.addEventListener('click', () => openEditor(unit));
  return card;
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
  for (const checkbox of byId('critical-options').querySelectorAll('input')) {
    checkbox.checked = unit?.criticalHits.includes(checkbox.value) ?? false;
  }
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
  for (const name of ['chassis', 'variant']) {
    const field = fields.namedItem(name);
    field.setCustomValidity(field.value && !field.value.trim() ? 'Enter a value.' : '');
  }
}

function openAccountPicker() {
  accountDialog.showModal();
}

for (const name of criticalSystems) {
  const label = document.createElement('label');
  label.className = 'check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'criticalHits';
  input.value = name;
  label.append(input, name);
  byId('critical-options').append(label);
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
  const id = editingId ?? `unit-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
  const unit = {
    id,
    chassis: data.get('chassis').trim(),
    variant: data.get('variant').trim(),
    type: data.get('type'),
    armorTotal: Number(data.get('armorTotal')),
    armorRemaining: Number(data.get('armorRemaining')),
    structureTotal: Number(data.get('structureTotal')),
    structureRemaining: Number(data.get('structureRemaining')),
    criticalHits: data.getAll('criticalHits'),
    inoperable: data.has('inoperable'),
  };
  if (editingId) {
    units[units.findIndex((entry) => entry.id === editingId)] = unit;
  } else {
    units.push(unit);
  }
  unitDialog.close();
  renderUnits();
  const card = Array.from(unitList.children).find((entry) => entry.dataset.unitId === id);
  card.querySelector('button').focus();
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
