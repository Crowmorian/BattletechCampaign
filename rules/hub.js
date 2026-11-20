(() => {
  const campaignIntro = 'campaign/00-rules-of-engagement.md';
  // Add each new Markdown file here in the order it should appear in the hub.
  const topics = {
    'campaign-panel': [
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
  const reader = document.querySelector('[data-rules-reader]');
  reader.innerHTML = `
    <div class="rules-tabs" role="tablist" aria-label="Rule sections">
      <button id="campaign-tab" type="button" role="tab" aria-selected="true" aria-controls="campaign-panel">Campaign Rules</button>
      <button id="alpha-strike-tab" type="button" role="tab" aria-selected="false" aria-controls="alpha-strike-panel" tabindex="-1">Alpha Strike</button>
    </div>
    <div class="rules-scroll">
      <section id="campaign-panel" role="tabpanel" aria-labelledby="campaign-tab" tabindex="0">
        <div class="rules-topics"></div>
      </section>
      <section id="alpha-strike-panel" role="tabpanel" aria-labelledby="alpha-strike-tab" tabindex="0" hidden>
        <header class="rule-intro"><h3>Alpha Strike Rules Cheat Sheets</h3></header>
        <div class="rules-topics"></div>
      </section>
    </div>`;
  const tabList = reader.querySelector('.rules-tabs');
  const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
  const scroll = reader.querySelector('.rules-scroll');
  const loadedPanels = new Set();
  let selected = tabs[0];

  async function readTopic(path, markdown) {
    const response = await fetch(`rules/${path}`);
    if (!response.ok) throw new Error(`Unable to load ${path}`);
    const source = await response.text();
    const heading = /^#\s+([^\r\n]+)\r?\n/.exec(source);
    if (!heading) throw new Error(`Missing topic title in ${path}`);

    const isIntro = path === campaignIntro;
    const topic = document.createElement(isIntro ? 'article' : 'details');
    topic.className = isIntro ? 'rule-intro' : 'rule-topic';
    const title = document.createElement(isIntro ? 'h3' : 'summary');
    title.textContent = heading[1].trim();
    const content = document.createElement('div');
    content.className = 'rule-content';
    content.innerHTML = markdown.render(source.slice(heading[0].length));
    for (const [index, table] of Array.from(content.querySelectorAll('table')).entries()) {
      const frame = document.createElement('div');
      frame.className = 'rule-table';
      frame.tabIndex = 0;
      frame.setAttribute('role', 'region');
      frame.setAttribute('aria-label', `Table ${index + 1} in ${title.textContent}`);
      table.replaceWith(frame);
      frame.append(table);
    }
    topic.append(title, content);
    return topic;
  }

  async function loadPanel(panel) {
    if (loadedPanels.has(panel)) return;
    loadedPanels.add(panel);

    const status = document.createElement('p');
    status.className = 'rules-status';
    status.setAttribute('role', 'status');
    const list = panel.querySelector('.rules-topics');
    list.replaceChildren(status);
    if (location.protocol === 'file:') {
      status.textContent = 'Open the published site or serve this folder over HTTP to read the rules.';
      return;
    }
    if (typeof window.markdownit !== 'function') {
      status.textContent = 'The rules reader could not load. Reload the page to try again.';
      return;
    }

    status.textContent = 'Loading rules…';
    const markdown = window.markdownit({ html: false });
    const entries = topics[panel.id];
    const sources = panel.id === 'campaign-panel' ? [campaignIntro, ...entries] : entries;
    const results = await Promise.allSettled(sources.map((path) => readTopic(path, markdown)));
    const available = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    list.append(...available);
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

  function activate(tab, focus = true) {
    if (selected !== tab) {
      for (const option of tabs) {
        const active = option === tab;
        option.setAttribute('aria-selected', String(active));
        option.tabIndex = active ? 0 : -1;
        document.getElementById(option.getAttribute('aria-controls')).hidden = !active;
      }
      selected = tab;
      scroll.scrollTop = 0;
      if (!dialog) window.scrollTo(0, 0);
    }
    if (focus) tab.focus();
    loadPanel(document.getElementById(tab.getAttribute('aria-controls')));
  }

  openButton?.addEventListener('click', () => {
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

  if (!dialog) activate(location.hash === '#alpha-strike' ? tabs[1] : tabs[0], false);
})();
