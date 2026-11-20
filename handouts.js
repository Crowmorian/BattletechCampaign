(() => {
  const account = campaignPreview.requireAccount();
  if (!account) return;
  campaignPreview.watchAccount(account);

  const isGM = account === 'gm';
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
  const samples = [
    {
      id: 'relay-intel', title: 'Relay Site Intel', visible: true, game: null, images: [],
      body: 'The relay logged a brief transmission before going dark. Its last coordinates point to the old service road north of the outpost.',
    },
    {
      id: 'patrol-report', title: 'Patrol Debrief', visible: true, game: 'Game 1 · Border Relay Patrol', images: [],
      body: 'Both companies returned from the patrol. The northern relay was intact, and the crews recorded an unmarked supply route.',
    },
  ];
  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open('battletech-preview-handouts', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('handouts', { keyPath: 'id' });
      for (const sample of samples) store.add(sample);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Handout storage is blocked.'));
  });
  const changes = typeof BroadcastChannel === 'function' ? new BroadcastChannel('battletech-preview-handouts') : null;
  const objectUrls = [];
  const removedImages = new Set();
  let entries = [];
  let editingId = null;
  let archiveId = null;
  let revision = 0;

  async function transact(mode, work) {
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('handouts', mode);
      let value;
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error ?? new Error('Handout storage operation stopped.'));
      work(transaction.objectStore('handouts'), (result) => { value = result; });
    });
  }

  async function refresh() {
    const requestRevision = ++revision;
    try {
      const saved = await transact('readonly', (store, done) => {
        const request = store.getAll();
        request.onsuccess = () => done(request.result);
      });
      if (requestRevision !== revision) return false;
      entries = saved.sort((left, right) => left.title.localeCompare(right.title));
      render();
      return true;
    } catch {
      status.textContent = 'Handouts could not load from browser storage.';
      return false;
    }
  }

  async function update(id, change, message, feedback = status) {
    try {
      const saved = await transact('readwrite', (store, done) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (campaignPreview.account() !== 'gm') return;
          const result = change(request.result);
          if (result === undefined) return;
          if (result === null) store.delete(id);
          else store.put(result);
          done(true);
        };
      });
      if (!saved) {
        await refresh();
        feedback.textContent = 'This handout changed. Check the latest version and try again.';
        return false;
      }
    } catch {
      feedback.textContent = 'The handout could not be saved in this browser.';
      return false;
    }
    changes?.postMessage('updated');
    if (await refresh()) status.textContent = message;
    return true;
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
      for (const { file } of entry.images) {
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        const image = document.createElement('img');
        image.src = url;
        image.alt = file.name;
        image.loading = 'lazy';
        gallery.append(image);
      }
      content.append(gallery);
    }
    if (isGM) {
      const controls = document.createElement('div');
      controls.className = 'panel-actions';
      controls.append(
        action('Edit', () => openEditor(entry)),
        action(entry.visible ? 'Hide from players' : 'Show to players', async () => {
          const saved = await update(entry.id, (latest) => {
            if (latest && latest.visible === entry.visible) return { ...latest, visible: !latest.visible };
          }, entry.visible ? 'Handout hidden from players.' : 'Handout shown to players.');
          if (saved) findHandout(entry.id)?.querySelector('.handout-visibility')?.focus({ preventScroll: true });
        }, 'handout-visibility'),
      );
      if (!entry.game) controls.append(action('Archive', () => openArchiveEditor(entry)));
      controls.append(action('Delete', async () => {
        if (!window.confirm(`Delete “${entry.title}” and its attachments?`)) return;
        const saved = await update(entry.id, (latest) => latest ? null : undefined, 'Handout deleted.');
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
    form.reset();
    const fields = form.elements;
    fields.title.setCustomValidity('');
    fields.images.setCustomValidity('');
    fields.title.value = entry?.title ?? '';
    fields.body.value = entry?.body ?? '';
    byId('editor-title').textContent = entry ? 'Edit handout' : 'New handout';
    byId('editor-status').textContent = '';
    attachmentList.replaceChildren(...(entry?.images ?? []).map(({ id, file }) => {
      const item = document.createElement('li');
      item.append(file.name, action('Remove', () => {
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

  byId('handouts-page').hidden = false;
  refresh().then((loaded) => { if (loaded) status.textContent = ''; });
  changes?.addEventListener('message', refresh);
  window.addEventListener('pageshow', (event) => { if (event.persisted) refresh(); });
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
    const files = Array.from(fields.images.files);
    if (files.some((file) => !imageTypes.includes(file.type) || !file.size)) {
      fields.images.setCustomValidity('Choose nonempty PNG, JPEG, WebP, or GIF images.');
      fields.images.reportValidity();
      return;
    }
    const body = fields.body.value.trim();
    const id = editingId ?? crypto.randomUUID();
    const editing = Boolean(editingId);
    const removals = new Set(removedImages);
    const attached = files.map((file) => ({ id: crypto.randomUUID(), file }));
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    const saved = await update(id, (latest) => {
      if (editing && !latest) return undefined;
      const images = (latest?.images ?? []).filter((image) => !removals.has(image.id));
      return { id, visible: false, game: null, ...latest, title, body, images: [...images, ...attached] };
    }, editing ? 'Handout updated.' : 'Handout saved as a draft.', byId('editor-status'));
    submit.disabled = false;
    if (saved) {
      editor.close();
      reveal(id);
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
    const saved = await update(id, (latest) => latest && !latest.game ? { ...latest, game } : undefined,
      'Handout moved to the archive.', byId('archive-status'));
    submit.disabled = false;
    if (saved) {
      archiveEditor.close();
      reveal(id);
    }
  });
})();
