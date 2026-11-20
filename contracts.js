(async () => {
  const account = await campaignApi.requireMember();
  if (!account) return;

  const isGM = account.role === 'gm';
  const byId = (id) => document.getElementById(id);
  const currentSection = byId('current-contract');
  const offerList = byId('contract-list');
  const currentObjectives = byId('current-objectives');
  const offerTemplate = byId('offer-template');
  const objectiveTemplate = byId('objective-template');
  const objectivesTemplate = byId('objectives-template');
  const objectiveDialog = byId('objective-dialog');
  const objectiveEditor = byId('objective-editor');
  const objectiveEditorStatus = byId('objective-editor-status');
  const contractDialog = byId('contract-dialog');
  const contractForm = byId('contract-form');
  const formStatus = byId('contract-form-status');
  const status = byId('contract-status');
  const objectiveStates = {
    active: { label: 'Active', mark: '' },
    completed: { label: 'Completed', mark: '✓' },
    lost: { label: 'Lost', mark: '×' },
  };
  let editedContractId = null;
  let objectiveContractId = null;
  let editedObjectiveId = null;
  let renderedCurrentId = null;
  let loaded;
  let pending = false;

  function getOffer(data, id) {
    return data.offers.find((offer) => offer.id === id);
  }

  function getCurrent(data) {
    return getOffer(data, data.currentId);
  }

  async function update(operation, message, feedback = status) {
    if (pending) return false;
    pending = true;
    let saved = false;
    try {
      await operation();
      saved = true;
      render(await campaignApi.readContracts());
      status.textContent = message;
    } catch {
      const output = saved ? status : feedback;
      output.textContent = saved ? 'Change saved. Refresh to see the latest contracts.' : 'Could not save the change. Refresh and try again.';
    } finally {
      pending = false;
    }
    return saved;
  }

  function rewardText(offer) {
    return `${offer.reward.toLocaleString()} SP reward`;
  }

  function makeOffer(offer) {
    const entry = offerTemplate.content.firstElementChild.cloneNode(true);
    entry.dataset.contractId = offer.id;
    entry.querySelector('.offer-title').textContent = offer.title;
    entry.querySelector('.contract-reward').textContent = rewardText(offer);
    campaignText.render(entry.querySelector('.contract-briefing'), offer.briefing);
    if (!isGM) return entry;

    const visibility = entry.querySelector('.offer-visibility');
    visibility.hidden = false;
    visibility.textContent = offer.visible ? 'Visible to players' : 'Draft';
    entry.querySelector('.contract-actions').hidden = false;
    entry.querySelector('.offer-edit').addEventListener('click', () => openEditor(offer.id));
    entry.querySelector('.rule-content').append(makeObjectives(offer, true));

    const toggle = entry.querySelector('.offer-visibility-toggle');
    toggle.textContent = offer.visible ? 'Hide from players' : 'Show to players';
    toggle.addEventListener('click', async () => {
      const saved = await update(() => campaignApi.showContract(offer.id, !offer.visible),
        offer.visible ? 'Contract hidden from players.' : 'Contract shown to players.');
      if (saved) findOfferEntry(offer.id)?.querySelector('.offer-visibility-toggle')?.focus({ preventScroll: true });
    });

    const activate = entry.querySelector('.offer-activate');
    activate.hidden = !offer.visible;
    activate.addEventListener('click', async () => {
      const saved = await update(() => campaignApi.setCurrentContract(offer.id, renderedCurrentId), 'Current contract selected.');
      if (saved) byId('current-name').focus();
    });
    return entry;
  }

  function makeObjective(contractId, objective) {
    const card = objectiveTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.objectiveId = objective.id;
    card.dataset.status = objective.status;
    card.querySelector('h4').textContent = objective.name;
    const description = card.querySelector('.objective-description');
    campaignText.render(description, objective.description);
    description.hidden = !objective.description;
    const rule = card.querySelector('.objective-rule');
    campaignText.render(rule.querySelector('.formatted-text'), objective.rule_text);
    rule.hidden = !objective.rule_text;
    const reward = card.querySelector('.objective-reward');
    campaignText.render(reward.querySelector('.formatted-text'), objective.completion_reward);
    reward.hidden = !objective.completion_reward;
    const { label, mark } = objectiveStates[objective.status];
    card.querySelector('.objective-mark').textContent = mark;
    card.querySelector('.objective-state').textContent = label;
    if (!isGM) return card;

    card.querySelector('.objective-actions').hidden = false;
    const edit = card.querySelector('.objective-edit');
    edit.setAttribute('aria-label', `Edit objective ${objective.name}`);
    edit.addEventListener('click', () => openObjectiveEditor(contractId, objective));
    const visibility = card.querySelector('.objective-visibility');
    visibility.hidden = false;
    visibility.textContent = objective.visible ? 'Revealed' : 'Hidden';
    const toggle = card.querySelector('.objective-toggle');
    const action = objective.visible ? 'Hide' : 'Reveal';
    toggle.textContent = action;
    toggle.setAttribute('aria-label', `${action} ${objective.name}`);
    toggle.addEventListener('click', async () => {
      const visible = !objective.visible;
      const saved = await update(() => campaignApi.showObjective(objective.id, visible),
        visible ? 'Objective revealed.' : 'Objective hidden.');
      if (saved) focusObjectiveControl(objective.id, '.objective-toggle');
    });

    const select = card.querySelector('select');
    select.value = objective.status;
    select.setAttribute('aria-label', `Status for ${objective.name}`);
    select.addEventListener('change', async () => {
      const next = select.value;
      if (!Object.hasOwn(objectiveStates, next)) return;
      const saved = await update(() => campaignApi.setObjectiveStatus(objective.id, next, objective.status), 'Objective updated.');
      if (saved) {
        focusObjectiveControl(objective.id, 'select');
      } else {
        select.value = objective.status;
      }
    });
    return card;
  }

  function focusObjectiveControl(id, selector) {
    document.querySelector(`[data-objective-id="${CSS.escape(id)}"] ${selector}`)?.focus({ preventScroll: true });
  }

  function makeObjectives(contract, planned = false) {
    const panel = objectivesTemplate.content.firstElementChild.cloneNode(true);
    const objectives = contract.objectives.filter((objective) => isGM || objective.visible);
    panel.querySelector('.objective-list').append(...objectives.map((objective) => makeObjective(contract.id, objective)));
    const empty = panel.querySelector('.contract-empty');
    empty.hidden = objectives.length > 0;
    empty.textContent = isGM ? 'No objectives have been added.' : 'No objectives have been revealed.';
    if (!isGM) return panel;

    panel.querySelector('.objective-note').hidden = !planned;
    const add = panel.querySelector('.add-objective');
    add.hidden = false;
    add.addEventListener('click', () => openObjectiveEditor(contract.id));
    return panel;
  }

  function findOfferEntry(id) {
    return Array.from(offerList.children).find((entry) => entry.dataset.contractId === id);
  }

  function render(data) {
    loaded = data;
    const current = getCurrent(data);
    renderedCurrentId = current?.id ?? null;
    currentSection.hidden = !current;
    if (current) {
      byId('current-name').textContent = current.title;
      byId('current-reward').textContent = rewardText(current);
      campaignText.render(byId('current-briefing'), current.briefing);
      currentObjectives.replaceChildren(makeObjectives(current));
    } else {
      currentObjectives.replaceChildren();
    }

    const openOffer = offerList.querySelector('details[open]')?.dataset.contractId;
    const offers = data.offers.filter((offer) => offer.id !== current?.id && (isGM || offer.visible));
    offerList.replaceChildren(...offers.map(makeOffer));
    const openEntry = findOfferEntry(openOffer);
    if (openEntry) openEntry.open = true;
    byId('empty-contracts').hidden = offers.length > 0;
  }

  function openEditor(id) {
    const offer = getOffer(loaded, id);
    if (id && !offer) return;
    editedContractId = id ?? null;
    contractForm.reset();
    formStatus.textContent = '';
    const fields = contractForm.elements;
    byId('contract-editor-title').textContent = offer ? 'Edit contract' : 'New contract';
    fields.title.value = offer?.title ?? '';
    fields.briefing.value = offer?.briefing ?? '';
    fields.reward.value = offer?.reward ?? 0;
    fields.title.setCustomValidity('');
    fields.briefing.setCustomValidity('');
    contractDialog.showModal();
  }

  function readText(input) {
    const value = input.value.trim();
    input.setCustomValidity(value ? '' : 'Enter a value.');
    if (!value) input.reportValidity();
    return value;
  }

  function openObjectiveEditor(contractId, objective) {
    if (pending) return;
    objectiveContractId = contractId;
    editedObjectiveId = objective?.id ?? null;
    objectiveEditor.reset();
    objectiveEditorStatus.textContent = '';
    byId('objective-editor-title').textContent = objective ? 'Edit objective' : 'New objective';
    const fields = objectiveEditor.elements;
    fields.title.setCustomValidity('');
    fields.title.value = objective?.name ?? '';
    fields.description.value = objective?.description ?? '';
    fields.rule.value = objective?.rule_text ?? '';
    fields.reward.value = objective?.completion_reward ?? '';
    objectiveDialog.showModal();
  }

  render(await campaignApi.readContracts());
  status.textContent = '';
  if (!isGM) return;

  campaignText.attach(contractForm);
  campaignText.attach(objectiveEditor);
  byId('new-contract').hidden = false;
  byId('current-actions').hidden = false;
  byId('new-contract').addEventListener('click', () => openEditor());
  byId('edit-current').addEventListener('click', () => {
    if (renderedCurrentId) openEditor(renderedCurrentId);
  });
  byId('cancel-contract').addEventListener('click', () => contractDialog.close());
  byId('cancel-objective').addEventListener('click', () => objectiveDialog.close());

  for (const input of [contractForm.elements.title, contractForm.elements.briefing, objectiveEditor.elements.title]) {
    input.addEventListener('input', () => input.setCustomValidity(''));
  }

  contractForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = contractForm.elements;
    const title = readText(fields.title);
    if (!title) return;
    const briefing = readText(fields.briefing);
    if (!briefing) return;
    const values = { title, briefing, reward: fields.reward.valueAsNumber };
    let id = editedContractId;
    const saved = await update(async () => {
      if (id) await campaignApi.editContract(id, values);
      else id = (await campaignApi.createContract(values)).id;
    }, editedContractId ? 'Contract updated.' : 'Contract saved as a draft.', formStatus);
    if (!saved) return;
    contractDialog.close();
    const entry = findOfferEntry(id);
    if (entry) {
      entry.open = true;
      entry.querySelector('summary').focus();
    } else {
      byId('edit-current').focus();
    }
  });

  objectiveEditor.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const fields = objectiveEditor.elements;
    const name = readText(fields.title);
    if (!name) return;
    const details = {
      name,
      description: fields.description.value.trim(),
      rule_text: fields.rule.value.trim(),
      completion_reward: fields.reward.value.trim(),
    };
    const submit = objectiveEditor.querySelector('[type="submit"]');
    const contractId = objectiveContractId;
    let id = editedObjectiveId;
    submit.disabled = true;
    const saved = await update(async () => {
      if (id) await campaignApi.editObjective(id, details);
      else id = (await campaignApi.addObjective(contractId, details)).id;
    }, id ? 'Objective details updated.' : 'Hidden objective added.', objectiveEditorStatus);
    submit.disabled = false;
    if (!saved) return;
    objectiveDialog.close();
    focusObjectiveControl(id, '.objective-edit');
  });

  byId('clear-current').addEventListener('click', async () => {
    if (!renderedCurrentId) return;
    const saved = await update(() => campaignApi.setCurrentContract(null, renderedCurrentId), 'Current contract cleared.');
    if (saved) byId('available-title').focus();
  });

})().catch(() => {
  document.getElementById('contract-status').textContent = 'Could not load the contracts. Try refreshing the page.';
});
