(() => {
  const account = campaignPreview.requireAccount();
  if (!account) return;
  campaignPreview.watchAccount(account);

  const editor = document.getElementById('campaign-editor');
  const overviewInput = document.getElementById('overview-input');
  const goalsInput = document.getElementById('goals-input');
  const status = document.getElementById('campaign-status');

  function render({ overview, goals }) {
    document.getElementById('current-overview').textContent = overview || 'No overview has been published.';
    const list = document.getElementById('current-goals');
    list.hidden = goals.length === 0;
    document.getElementById('empty-goals').hidden = goals.length > 0;
    list.replaceChildren(...goals.map((goal) => {
      const entry = document.createElement('li');
      entry.textContent = goal;
      return entry;
    }));
  }

  const saved = campaignPreview.readOverview();
  render(saved);
  document.getElementById('campaign-page').hidden = false;
  if (account !== 'gm') return;

  editor.hidden = false;
  overviewInput.value = saved.overview;
  goalsInput.value = saved.goals.join('\n');
  editor.addEventListener('submit', (event) => {
    event.preventDefault();
    if (campaignPreview.account() !== 'gm') return;
    const overview = overviewInput.value.trim();
    const goals = goalsInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    try {
      campaignPreview.saveOverview({ overview, goals });
      render({ overview, goals });
      status.textContent = 'Changes saved in this browser.';
    } catch {
      status.textContent = 'Browser storage is unavailable. Changes could not be saved.';
    }
  });
})();
