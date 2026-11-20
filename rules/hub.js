(() => {
  // Add each new Markdown file here in the order it should appear in the hub.
  const topics = {
    'campaign-panel': [
      'campaign/00-rules-of-engagement.md',
      'campaign/01-building-your-company.md',
      'campaign/02-damage-and-repairs.md',
      'campaign/03-money-and-contracts.md',
      'campaign/04-battlefield-salvage.md',
      'campaign/05-withdrawal-and-survival.md',
    ],
    'alpha-strike-panel': [
      'alpha-strike/indirect-fire.md',
      'alpha-strike/melee-and-physical-attacks.md',
    ],
  };
  const openButton = document.getElementById('rules-button');
  const dialog = document.getElementById('rules-dialog');
  const tabList = dialog.querySelector('.rules-tabs');
  const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
  const scroll = dialog.querySelector('.rules-scroll');
  const loadedPanels = new Set();
  let selected = tabs[0];

  async function readTopic(path, markdown) {
    const response = await fetch(`rules/${path}`);
    if (!response.ok) throw new Error(`Unable to load ${path}`);
    const source = await response.text();
    const heading = /^#\s+([^\r\n]+)\r?\n/.exec(source);
    if (!heading) throw new Error(`Missing topic title in ${path}`);

    const topic = document.createElement('details');
    topic.className = 'rule-topic';
    const summary = document.createElement('summary');
    summary.textContent = heading[1].trim();
    const content = document.createElement('div');
    content.className = 'rule-content';
    content.innerHTML = markdown.render(source.slice(heading[0].length));
    for (const [index, table] of Array.from(content.querySelectorAll('table')).entries()) {
      const frame = document.createElement('div');
      frame.className = 'rule-table';
      frame.tabIndex = 0;
      frame.setAttribute('role', 'region');
      frame.setAttribute('aria-label', `Table ${index + 1} in ${summary.textContent}`);
      table.replaceWith(frame);
      frame.append(table);
    }
    topic.append(summary, content);
    return topic;
  }

  async function loadPanel(panel) {
    if (loadedPanels.has(panel)) return;
    loadedPanels.add(panel);

    const status = document.createElement('p');
    status.className = 'rules-status';
    status.setAttribute('role', 'status');
    panel.replaceChildren(status);
    if (location.protocol === 'file:') {
      status.textContent = 'Open the published player sheet or serve this folder over HTTP to read the rules.';
      return;
    }
    if (typeof window.markdownit !== 'function') {
      status.textContent = 'The rules reader could not load. Reload the page to try again.';
      return;
    }

    status.textContent = 'Loading rules…';
    const markdown = window.markdownit({ html: false });
    const results = await Promise.allSettled(topics[panel.id].map((path) => readTopic(path, markdown)));
    const available = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    panel.append(...available);
    if (available.length === results.length) {
      status.remove();
      return;
    }

    status.textContent = available.length ? 'Some topics could not load.' : 'These rules could not load.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => {
      loadedPanels.delete(panel);
      panel.focus();
      loadPanel(panel);
    });
    status.after(retry);
  }

  function activate(tab) {
    if (selected !== tab) {
      for (const option of tabs) {
        const active = option === tab;
        option.setAttribute('aria-selected', String(active));
        option.tabIndex = active ? 0 : -1;
        document.getElementById(option.getAttribute('aria-controls')).hidden = !active;
      }
      selected = tab;
      scroll.scrollTop = 0;
    }
    tab.focus();
    loadPanel(document.getElementById(tab.getAttribute('aria-controls')));
  }

  openButton.addEventListener('click', () => {
    dialog.showModal();
    activate(selected);
  });
  for (const tab of tabs) tab.addEventListener('click', () => activate(tab));

  tabList.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(selected);
    const next = {
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    activate(tabs[next]);
  });
})();
