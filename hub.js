(() => {
  const account = campaignPreview.account();
  const isGM = account === 'gm';
  const companies = campaignPreview.companies;
  const savedRosters = campaignPreview.readRosters()?.rosters;
  const companyName = (key) => savedRosters?.[key]?.name ?? companies[key];
  const signIn = document.getElementById('sign-in');
  const signOut = document.getElementById('sign-out');
  const accountOptions = document.getElementById('account-options');
  const chooser = document.getElementById('roster-picker');
  const rosterOptions = document.getElementById('roster-options');
  const browseRosters = document.getElementById('browse-rosters');
  const status = document.getElementById('hub-status');

  signIn.hidden = Boolean(account);
  signOut.hidden = !account;
  document.getElementById('public-rules').hidden = Boolean(account);
  document.getElementById('hub-navigation').hidden = !account;
  document.getElementById('my-roster').hidden = !account || isGM;
  browseRosters.hidden = !isGM;

  if (account) {
    const identity = document.getElementById('hub-account');
    identity.hidden = false;
    identity.textContent = isGM ? 'GM preview' : `${companyName(account)} · Player preview`;
  }

  for (const key of [...Object.keys(companies), 'gm']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = key === 'gm' ? 'GM' : companyName(key);
    button.addEventListener('click', () => {
      try {
        campaignPreview.signIn(key);
        location.reload();
      } catch {
        status.textContent = 'Preview sign-in requires browser storage.';
      }
    });
    accountOptions.append(button);
  }

  signOut.addEventListener('click', () => {
    campaignPreview.signOut();
    location.reload();
  });

  if (isGM) {
    document.getElementById('overview-description').textContent = 'Edit the overview and current goals.';
    for (const key of Object.keys(companies)) {
      const link = document.createElement('a');
      link.className = 'button';
      link.href = `roster.html?company=${key}`;
      link.textContent = companyName(key);
      rosterOptions.append(link);
    }
    browseRosters.addEventListener('click', () => chooser.showModal());
  }
  campaignPreview.watchAccount(account);
})();
