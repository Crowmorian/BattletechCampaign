(async () => {
  const account = await campaignApi.requireMember();
  if (!account) return;

  const isGM = account.role === 'gm';
  const byId = (id) => document.getElementById(id);
  const current = byId('current-handouts');
  const archive = byId('archive');
  const editor = byId('handout-editor');
  const archiveEditor = byId('archive-editor');
  const form = byId('handout-form');
  const archiveForm = byId('archive-form');
  const status = byId('handouts-status');
  const attachmentList = byId('editor-images');
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const objectUrls = [];
  const removedImages = new Set();
  const uploadedFiles = new Set();
  let entries = [];
  let editingId = null;
  let archiveId = null;
  let pending = false;

  async function refresh() {
    entries = (await campaignApi.readHandouts()).sort((left, right) => left.title.localeCompare(right.title));
    render();
  }

  async function update(operation, message, feedback = status) {
    if (pending) return false;
    pending = true;
    let saved = false;
    try {
      await operation();
      saved = true;
      await refresh();
      status.textContent = message;
    } catch (error) {
      const output = saved ? status : feedback;
      output.textContent = saved ? 'Change saved. Refresh to see the latest handouts.' : error.uiMessage ?? 'Could not finish that change. Try again.';
    } finally {
      pending = false;
    }
    return saved;
  }

  function action(label, callback, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', callback);
    return button;
  }

  function makeHandout(entry) {
    const disclosure = document.createElement('details');
    disclosure.className = 'rule-topic';
    disclosure.dataset.handoutId = entry.id;
    const summary = document.createElement('summary');
    summary.textContent = entry.title;
    if (isGM && !entry.visible) {
      const draft = document.createElement('span');
      draft.className = 'offer-visibility';
      draft.textContent = 'Draft';
      summary.append(draft);
    }
    const content = document.createElement('div');
    content.className = 'rule-content';
    if (entry.body) {
      const text = document.createElement('p');
      text.className = 'contract-briefing';
      text.textContent = entry.body;
      content.append(text);
    }
    if (entry.images.length) {
      const gallery = document.createElement('div');
      gallery.className = 'handout-images';
      let requested = false;
      disclosure.addEventListener('toggle', async () => {
        if (!disclosure.open || requested) return;
        requested = true;
        const results = await Promise.allSettled(entry.images.map((image) => campaignApi.downloadHandoutImage(image.object_path)));
        if (!gallery.isConnected) return;
        for (const [index, result] of results.entries()) {
          const filename = entry.images[index].filename;
          if (result.status === 'rejected') {
            const message = document.createElement('p');
            message.textContent = `Could not load ${filename}.`;
            gallery.append(message);
            continue;
          }
          const url = URL.createObjectURL(result.value);
          objectUrls.push(url);
          const image = document.createElement('img');
          image.src = url;
          image.alt = filename;
          gallery.append(image);
        }
      });
      content.append(gallery);
    }
    if (isGM) {
      const controls = document.createElement('div');
      controls.className = 'panel-actions';
      controls.append(
        action('Edit', () => openEditor(entry)),
        action(entry.visible ? 'Hide from players' : 'Show to players', async () => {
          const saved = await update(() => campaignApi.showHandout(entry.id, !entry.visible),
            entry.visible ? 'Handout hidden from players.' : 'Handout shown to players.');
          if (saved) findHandout(entry.id)?.querySelector('.handout-visibility')?.focus({ preventScroll: true });
        }, 'handout-visibility'),
      );
      if (!entry.game) controls.append(action('Archive', () => openArchiveEditor(entry)));
      controls.append(action('Delete', async () => {
        if (!window.confirm(`Delete “${entry.title}” and its attachments?`)) return;
        const saved = await update(() => campaignApi.deleteHandout(entry.id), 'Handout deleted.');
        if (saved) byId('new-handout').focus();
      }, 'danger'));
      content.append(controls);
    }
    disclosure.append(summary, content);
    return disclosure;
  }

  function findHandout(id) {
    return document.querySelector(`[data-handout-id="${CSS.escape(id)}"]`);
  }

  function reveal(id) {
    const entry = findHandout(id);
    if (!entry) return;
    const folder = entry.closest('.archive-game');
    if (folder) folder.open = true;
    entry.open = true;
    entry.querySelector('summary').focus();
  }

  function render() {
    const openHandouts = new Set(Array.from(document.querySelectorAll('[data-handout-id][open]'), (entry) => entry.dataset.handoutId));
    const openGames = new Set(Array.from(archive.querySelectorAll('.archive-game[open]'), (game) => game.dataset.game));
    for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url);

    const latest = [];
    const games = new Map();
    for (const entry of entries) {
      if (!isGM && !entry.visible) continue;
      const handout = makeHandout(entry);
      handout.open = openHandouts.has(entry.id);
      if (!entry.game) {
        latest.push(handout);
        continue;
      }
      const key = entry.game.toLowerCase();
      if (!games.has(key)) games.set(key, { name: entry.game, members: [] });
      games.get(key).members.push(handout);
    }
    current.replaceChildren(...latest);
    byId('no-current').hidden = latest.length > 0;
    archive.replaceChildren(...Array.from(games.values()).sort((left, right) => left.name.localeCompare(right.name)).map(({ name, members }) => {
      const folder = document.createElement('details');
      folder.className = 'rule-topic archive-game';
      folder.dataset.game = name.toLowerCase();
      folder.open = openGames.has(folder.dataset.game);
      const title = document.createElement('summary');
      title.textContent = name;
      const handouts = document.createElement('div');
      handouts.className = 'archived-handouts';
      handouts.append(...members);
      folder.append(title, handouts);
      return folder;
    }));
    byId('no-archive').hidden = games.size > 0;
  }

  function openEditor(entry) {
    editingId = entry?.id ?? null;
    removedImages.clear();
    uploadedFiles.clear();
    form.reset();
    const fields = form.elements;
    fields.title.setCustomValidity('');
    fields.images.setCustomValidity('');
    fields.title.value = entry?.title ?? '';
    fields.body.value = entry?.body ?? '';
    byId('editor-title').textContent = entry ? 'Edit handout' : 'New handout';
    byId('editor-status').textContent = '';
    attachmentList.replaceChildren(...(entry?.images ?? []).map(({ id, filename }) => {
      const item = document.createElement('li');
      item.append(filename, action('Remove', () => {
        removedImages.add(id);
        item.remove();
        attachmentList.hidden = !attachmentList.children.length;
      }));
      return item;
    }));
    attachmentList.hidden = !attachmentList.children.length;
    editor.showModal();
  }

  function openArchiveEditor(entry) {
    archiveId = entry.id;
    archiveForm.reset();
    archiveForm.elements.game.setCustomValidity('');
    byId('archive-entry').textContent = entry.title;
    byId('archive-status').textContent = '';
    const names = [...new Set(entries.map((handout) => handout.game).filter(Boolean))].sort();
    byId('archive-games').replaceChildren(...names.map((name) => new Option(name, name)));
    archiveEditor.showModal();
  }

  function requiredText(input, message) {
    const value = input.value.trim();
    if (!value) {
      input.setCustomValidity(message);
      input.reportValidity();
    }
    return value;
  }

  await refresh();
  status.textContent = '';
  if (!isGM) return;

  const add = byId('new-handout');
  add.hidden = false;
  add.addEventListener('click', () => openEditor());
  byId('cancel-handout').addEventListener('click', () => editor.close());
  byId('cancel-archive').addEventListener('click', () => archiveEditor.close());
  for (const field of [form.elements.title, form.elements.images, archiveForm.elements.game]) {
    field.addEventListener('input', () => field.setCustomValidity(''));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = form.elements;
    const title = requiredText(fields.title, 'Enter a handout title.');
    if (!title) return;
    const files = Array.from(fields.images.files).filter((file) => !uploadedFiles.has(file));
    if (files.some((file) => !imageTypes.includes(file.type) || !file.size)) {
      fields.images.setCustomValidity('Choose nonempty PNG, JPEG, WebP, or GIF images.');
      fields.images.reportValidity();
      return;
    }
    const body = fields.body.value.trim();
    const editing = Boolean(editingId);
    const removals = new Set(removedImages);
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    const saved = await update(async () => {
      if (editingId) await campaignApi.editHandout(editingId, { title, body });
      else editingId = (await campaignApi.createHandout({ title, body })).id;
      try {
        for (const file of files) {
          await campaignApi.addHandoutImage(editingId, file);
          uploadedFiles.add(file);
        }
        const previous = entries.find((entry) => entry.id === editingId)?.images ?? [];
        await campaignApi.removeHandoutImages(previous.filter((image) => removals.has(image.id)));
      } catch {
        throw Object.assign(new Error('Attachment update interrupted.'), { uiMessage: 'Handout text saved. Some attachments could not be updated. Try saving again.' });
      }
    }, editing ? 'Handout updated.' : 'Handout saved as a draft.', byId('editor-status'));
    submit.disabled = false;
    if (saved) {
      editor.close();
      reveal(editingId);
    }
  });

  archiveForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const typed = requiredText(archiveForm.elements.game, 'Enter a game name.');
    if (!typed) return;
    const game = entries.find((entry) => entry.game?.toLowerCase() === typed.toLowerCase())?.game ?? typed;
    const id = archiveId;
    const submit = archiveForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    const saved = await update(() => campaignApi.archiveHandout(id, game),
      'Handout moved to the archive.', byId('archive-status'));
    submit.disabled = false;
    if (saved) {
      archiveEditor.close();
      reveal(id);
    }
  });
})().catch(() => {
  document.getElementById('handouts-status').textContent = 'Could not load the handouts. Try refreshing the page.';
});
