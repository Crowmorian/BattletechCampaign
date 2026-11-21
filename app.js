async function initializeRoster() {
  const criticalSystems = [
    { key: 'engine', label: 'Engine', limit: 1, effect: '+1 Heat when firing weapons' },
    { key: 'fireControl', label: 'Fire Control', limit: 4, effect: '+2 To-Hit each' },
    { key: 'mp', label: 'MP', limit: 4, effect: '½ MV each' },
    { key: 'weapons', label: 'Weapons', limit: 4, effect: '−1 Damage each' },
  ];
  const unitTypes = { mech: 'BattleMech', vehicle: 'Vehicle', air: 'Air unit' };

  const byId = (id) => document.getElementById(id);
  const saveStatus = byId('save-status');
  const sheet = byId('sheet');
  const supply = byId('supply');
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

  const account = await campaignApi.requireMember();
  if (!account) return;
  const roster = await campaignApi.readRoster(account, new URLSearchParams(location.search).get('company'));
  if (!roster) {
    saveStatus.textContent = account.role === 'gm' ? 'Choose a roster from the Campaign Hub.' : 'Your account has no roster assigned yet.';
    return;
  }
  const canEdit = account.role === 'player';
  let editingId = null;
  let criticalDraft = {};
  let editingPending = false;

  function renderSheet() {
    byId('group-name').textContent = roster.name;
    companyIcons.apply(sheet.querySelector('.company-icon'), roster);
    byId('sheet-mode').textContent = canEdit ? 'Player sheet' : 'GM view · Read only';
    byId('supply-form').hidden = !canEdit;
    byId('supply-readout').hidden = canEdit;
    addUnit.hidden = !canEdit;
    saveStatus.textContent = '';
    supply.value = roster.supply;
    byId('supply-balance').textContent = roster.supply;
    if (!canEdit) byId('empty-roster').textContent = 'This roster has no units.';
    renderUnits();
    sheet.hidden = false;
  }

  function renderRosterCount() {
    const { units } = roster;
    const available = units.filter((unit) => !unit.inoperable).length;
    const unitLabel = units.length === 1 ? 'unit' : 'units';
    byId('roster-count').textContent = `${units.length} ${unitLabel} · ${available} available`;
    byId('empty-roster').hidden = units.length > 0;
  }

  function renderUnits() {
    unitList.replaceChildren(...roster.units.map(renderCard));
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

    if (!canEdit) {
      card.querySelector('.card-actions').hidden = true;
      const unitStatus = card.querySelector('.unit-status');
      unitStatus.textContent = unit.inoperable ? 'Inoperable' : 'Available';
      unitStatus.hidden = false;
      return card;
    }

    const inoperable = card.querySelector('input');
    inoperable.checked = unit.inoperable;
    inoperable.setAttribute('aria-label', `Inoperable: ${unit.chassis} ${unit.variant}`);
    inoperable.addEventListener('change', async () => {
      const value = inoperable.checked;
      inoperable.disabled = true;
      try {
        await campaignApi.setInoperable(unit.id, value);
        unit.inoperable = value;
        card.classList.toggle('inoperable', unit.inoperable);
        renderRosterCount();
        saveStatus.textContent = `${unit.chassis} status updated.`;
      } catch {
        inoperable.checked = unit.inoperable;
        saveStatus.textContent = 'Could not save the unit status.';
      } finally {
        inoperable.disabled = false;
      }
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
    if (!canEdit || editingPending) return;
    byId('unit-form-status').textContent = '';
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

  byId('supply-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canEdit) return;
    const balance = supply.valueAsNumber;
    if (!Number.isSafeInteger(balance)) {
      supply.setCustomValidity('Enter a whole number within the supported range.');
      supply.reportValidity();
      return;
    }
    const submit = event.currentTarget.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      await campaignApi.saveSupply(roster.id, balance);
      roster.supply = balance;
      saveStatus.textContent = 'Supply points updated.';
    } catch {
      saveStatus.textContent = 'Could not save supply points.';
    } finally {
      submit.disabled = false;
    }
  });
  supply.addEventListener('input', () => supply.setCustomValidity(''));

  addUnit.addEventListener('click', () => openEditor());
  byId('cancel-editor').addEventListener('click', () => unitDialog.close());
  unitForm.addEventListener('input', updateEditorValidity);
  unitForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canEdit || editingPending) return;
    updateEditorValidity();
    if (!unitForm.reportValidity()) return;

    const data = new FormData(unitForm);
    const units = roster.units;
    const unitIndex = units.findIndex((entry) => entry.id === editingId);
    const existing = units[unitIndex];
    const unit = {
      ...existing,
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
    const submit = unitForm.querySelector('[type="submit"]');
    editingPending = submit.disabled = true;
    try {
      const saved = await campaignApi.saveUnit(roster.id, unit, existing?.id);
      if (existing) units[unitIndex] = saved;
      else units.push(saved);
      unitDialog.close();
      renderUnits();
      const card = Array.from(unitList.children).find((entry) => entry.dataset.unitId === saved.id);
      card.querySelector('.card-actions button').focus();
      saveStatus.textContent = `${saved.chassis} saved.`;
    } catch {
      byId('unit-form-status').textContent = 'Could not save this unit. Try again.';
    } finally {
      editingPending = submit.disabled = false;
    }
  });

  removeUnit.addEventListener('click', () => {
    if (!canEdit || editingPending) return;
    const unit = roster.units.find((entry) => entry.id === editingId);
    byId('remove-description').textContent = `Remove ${unit.chassis} ${unit.variant} from this roster?`;
    removeDialog.returnValue = '';
    removeDialog.showModal();
  });

  removeDialog.addEventListener('close', async () => {
    if (removeDialog.returnValue !== 'remove' || !canEdit || editingPending) return;
    const id = editingId;
    editingPending = true;
    try {
      await campaignApi.removeUnit(roster.id, id);
      roster.units = roster.units.filter((unit) => unit.id !== id);
      unitDialog.close();
      renderUnits();
      addUnit.focus();
      saveStatus.textContent = 'Unit removed.';
    } catch {
      byId('unit-form-status').textContent = 'Could not remove this unit. Try again.';
    } finally {
      editingPending = false;
    }
  });

  renderSheet();
}

initializeRoster().catch(() => {
  document.getElementById('save-status').textContent = 'Could not load this roster. Try refreshing the page.';
});
