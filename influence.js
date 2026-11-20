(() => {
  const account = campaignPreview.requireAccount();
  if (!account) return;
  campaignPreview.watchAccount(account);

  const isGM = account === 'gm';
  const byId = (id) => document.getElementById(id);
  const list = byId('faction-list');
  const template = byId('faction-template');
  const editor = byId('faction-editor');
  const form = byId('faction-form');
  const name = form.elements.faction;
  const add = byId('add-faction');
  const status = byId('influence-status');
  const editorStatus = byId('faction-status');
  const samples = [
    { id: 'federated-suns', name: 'Federated Suns', score: 2 },
    { id: 'free-worlds-league', name: 'Free Worlds League', score: 0 },
    { id: 'draconis-combine', name: 'Draconis Combine', score: -2 },
  ];

  function read() {
    return campaignPreview.readInfluence() ?? structuredClone(samples);
  }

  function update(change, message, feedback = status) {
    if (campaignPreview.account() !== 'gm') return false;
    const factions = read();
    if (!change(factions)) return false;
    try {
      campaignPreview.saveInfluence(factions);
    } catch {
      feedback.textContent = 'Browser storage is unavailable. Changes could not be saved.';
      return false;
    }
    render(factions);
    status.textContent = message;
    return true;
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
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-disabled') === 'true') return;
        const saved = update((factions) => {
          const latest = factions.find((entry) => entry.id === faction.id);
          if (!latest || Math.abs(latest.score + delta) > 5) return false;
          latest.score += delta;
          return true;
        }, `${faction.name} influence updated.`);
        if (saved) findCard(faction.id).querySelector(`[data-shift="${delta}"]`).focus({ preventScroll: true });
      });
    }
    const remove = card.querySelector('.remove-faction');
    remove.setAttribute('aria-label', `Remove ${faction.name}`);
    remove.addEventListener('click', () => {
      if (!window.confirm(`Remove ${faction.name} from the shared standings?`)) return;
      const saved = update((factions) => {
        const index = factions.findIndex((entry) => entry.id === faction.id);
        if (index < 0) return false;
        factions.splice(index, 1);
        return true;
      }, `${faction.name} removed.`);
      if (saved) add.focus();
    });
    return card;
  }

  function render(factions) {
    list.replaceChildren(...factions.map(makeCard));
    byId('no-factions').hidden = factions.length > 0;
  }

  render(read());
  campaignPreview.watchInfluence(() => render(read()));
  byId('influence-page').hidden = false;
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const faction = { id: crypto.randomUUID(), name: name.value.trim(), score: 0 };
    if (!faction.name) {
      name.setCustomValidity('Enter a faction name.');
      name.reportValidity();
      return;
    }
    const saved = update((factions) => {
      if (factions.some((entry) => entry.name.toLowerCase() === faction.name.toLowerCase())) {
        name.setCustomValidity('That faction already has a card.');
        name.reportValidity();
        return false;
      }
      factions.push(faction);
      return true;
    }, `${faction.name} added.`, editorStatus);
    if (!saved) return;
    editor.close();
    findCard(faction.id).querySelector('h2').focus();
  });
})();
