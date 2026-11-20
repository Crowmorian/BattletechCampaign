(async () => {
  const account = await campaignApi.requireMember();
  if (!account) return;

  const isGM = account.role === 'gm';
  const byId = (id) => document.getElementById(id);
  const currentSection = byId('current-contract');
  const offerList = byId('contract-list');
  const objectiveList = byId('objective-list');
  const offerTemplate = byId('offer-template');
  const objectiveTemplate = byId('objective-template');
  const objectiveInput = byId('objective-name');
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
    entry.querySelector('.contract-briefing').textContent = offer.briefing;
    if (!isGM) return entry;

    const visibility = entry.querySelector('.offer-visibility');
    visibility.hidden = false;
    visibility.textContent = offer.visible ? 'Visible to players' : 'Draft';
    entry.querySelector('.contract-actions').hidden = false;
    entry.querySelector('.offer-edit').addEventListener('click', () => openEditor(offer.id));

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
    const { label, mark } = objectiveStates[objective.status];
    card.querySelector('.objective-mark').textContent = mark;
    card.querySelector('.objective-state').textContent = label;
    if (!isGM) return card;

    const select = card.querySelector('select');
    select.hidden = false;
    select.value = objective.status;
    select.setAttribute('aria-label', `Status for ${objective.name}`);
    select.addEventListener('change', async () => {
      const next = select.value;
      if (!Object.hasOwn(objectiveStates, next)) return;
      if (renderedCurrentId !== contractId) return;
      const saved = await update(() => campaignApi.setObjectiveStatus(objective.id, next, objective.status), 'Objective updated.');
      if (saved) {
        const updated = Array.from(objectiveList.children).find((entry) => entry.dataset.objectiveId === objective.id);
        updated?.querySelector('select')?.focus({ preventScroll: true });
      } else {
        select.value = objective.status;
      }
    });
    return card;
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
      byId('current-briefing').textContent = current.briefing;
      byId('empty-objectives').hidden = current.objectives.length > 0;
      objectiveList.replaceChildren(...current.objectives.map((objective) => makeObjective(current.id, objective)));
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

  render(await campaignApi.readContracts());
  status.textContent = '';
  if (!isGM) return;

  byId('new-contract').hidden = false;
  byId('current-actions').hidden = false;
  byId('objective-form').hidden = false;
  byId('new-contract').addEventListener('click', () => openEditor());
  byId('edit-current').addEventListener('click', () => {
    if (renderedCurrentId) openEditor(renderedCurrentId);
  });
  byId('cancel-contract').addEventListener('click', () => contractDialog.close());

  for (const input of [objectiveInput, contractForm.elements.title, contractForm.elements.briefing]) {
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

  byId('clear-current').addEventListener('click', async () => {
    if (!renderedCurrentId) return;
    const saved = await update(() => campaignApi.setCurrentContract(null, renderedCurrentId), 'Current contract cleared.');
    if (saved) byId('available-title').focus();
  });

  byId('objective-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = readText(objectiveInput);
    if (!name) return;
    if (!renderedCurrentId) return;
    const saved = await update(() => campaignApi.addObjective(renderedCurrentId, name), 'Objective added.');
    if (saved) {
      objectiveInput.value = '';
      objectiveInput.focus();
    }
  });
})().catch(() => {
  document.getElementById('contract-status').textContent = 'Could not load the contracts. Try refreshing the page.';
});
