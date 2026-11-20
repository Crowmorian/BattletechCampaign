(async () => {
  const account = await campaignApi.requireMember();
  if (!account) return;

  const isGM = account.role === 'gm';
  const byId = (id) => document.getElementById(id);
  const list = byId('faction-list');
  const template = byId('faction-template');
  const editor = byId('faction-editor');
  const form = byId('faction-form');
  const name = form.elements.faction;
  const add = byId('add-faction');
  const status = byId('influence-status');
  const editorStatus = byId('faction-status');
  let pending = false;

  async function update(operation, message, feedback = status) {
    if (pending) return false;
    pending = true;
    let saved = false;
    try {
      await operation();
      saved = true;
      render(await campaignApi.readInfluence());
      status.textContent = message;
    } catch (error) {
      const output = saved ? status : feedback;
      if (saved) output.textContent = 'Change saved. Refresh to see the latest standings.';
      else output.textContent = error.code === '23505' ? 'That faction already has a card.' : 'Could not save that change. Refresh and try again.';
    } finally {
      pending = false;
    }
    return saved;
  }

  function findCard(id) {
    return Array.from(list.children).find((entry) => entry.dataset.factionId === id);
  }

  function makeCard(faction) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.factionId = faction.id;
    card.querySelector('h2').textContent = faction.name;
    const track = card.querySelector('.influence-track');
    for (let position = -5; position <= 5; position += 1) {
      const pip = document.createElement('span');
      const negative = position < 0;
      pip.className = position === 0 ? 'influence-center' : `influence-pip ${negative ? 'negative' : 'positive'}`;
      pip.classList.toggle('filled', position !== 0 && (negative ? faction.score <= position : faction.score >= position));
      track.append(pip);
    }
    const score = card.querySelector('.influence-score');
    score.textContent = faction.score === 0 ? '0 · Neutral' : `${faction.score > 0 ? '+' : '−'}${Math.abs(faction.score)}`;
    if (!isGM) return card;

    card.querySelector('.faction-actions').hidden = false;
    for (const button of card.querySelectorAll('[data-shift]')) {
      const delta = Number(button.dataset.shift);
      button.setAttribute('aria-disabled', String(Math.abs(faction.score + delta) > 5));
      button.setAttribute('aria-label', `${delta > 0 ? 'Increase' : 'Decrease'} influence with ${faction.name}`);
      button.addEventListener('click', async () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        const saved = await update(() => campaignApi.setInfluence(faction.id, faction.score + delta, faction.score), `${faction.name} influence updated.`);
        if (saved) findCard(faction.id)?.querySelector(`[data-shift="${delta}"]`)?.focus({ preventScroll: true });
      });
    }
    const remove = card.querySelector('.remove-faction');
    remove.setAttribute('aria-label', `Remove ${faction.name}`);
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove ${faction.name} from the shared standings?`)) return;
      const saved = await update(() => campaignApi.removeFaction(faction.id), `${faction.name} removed.`);
      if (saved) add.focus();
    });
    return card;
  }

  function render(factions) {
    list.replaceChildren(...factions.map(makeCard));
    byId('no-factions').hidden = factions.length > 0;
  }

  render(await campaignApi.readInfluence());
  status.textContent = '';
  if (!isGM) return;

  add.hidden = false;
  add.addEventListener('click', () => {
    form.reset();
    name.setCustomValidity('');
    editorStatus.textContent = '';
    editor.showModal();
  });
  byId('cancel-faction').addEventListener('click', () => editor.close());
  name.addEventListener('input', () => name.setCustomValidity(''));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const factionName = name.value.trim();
    if (!factionName) {
      name.setCustomValidity('Enter a faction name.');
      name.reportValidity();
      return;
    }
    let faction;
    const saved = await update(async () => { faction = await campaignApi.addFaction(factionName); }, `${factionName} added.`, editorStatus);
    if (!saved) return;
    editor.close();
    findCard(faction.id)?.querySelector('h2')?.focus();
  });
})().catch(() => {
  document.getElementById('influence-status').textContent = 'Could not load the shared standings. Try refreshing the page.';
});
