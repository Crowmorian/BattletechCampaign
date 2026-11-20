(async () => {
  const byId = (id) => document.getElementById(id);
  const signIn = byId('sign-in');
  const signInForm = byId('sign-in-form');
  const signOut = byId('sign-out');
  const chooser = byId('roster-picker');
  const rosterOptions = byId('roster-options');
  const chooserStatus = byId('roster-picker-status');
  const browseRosters = byId('browse-rosters');
  const status = byId('hub-status');

  async function render(account) {
    const isGM = account?.role === 'gm';
    signIn.hidden = Boolean(account);
    signOut.hidden = !account;
    byId('public-rules').hidden = Boolean(account?.role);
    byId('hub-navigation').hidden = !account?.role;
    byId('my-roster').hidden = account?.role !== 'player';
    browseRosters.hidden = !isGM;
    const identity = byId('hub-account');
    identity.hidden = !account?.role;
    if (isGM) identity.textContent = 'Game Master';
    if (account?.role === 'player') {
      identity.textContent = 'Player';
      const rosters = await campaignApi.listRosters();
      if (rosters[0]) identity.textContent = rosters[0].name;
    }
    byId('contracts-description').textContent = isGM
      ? 'Manage offers, the current contract, and objectives.'
      : 'Browse offers and track the current contract.';
    status.textContent = account && !account.role ? 'This account has no campaign access yet.' : '';
  }

  signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = signInForm.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = 'Signing in…';
    try {
      const { email, password } = signInForm.elements;
      await campaignApi.signIn(email.value.trim(), password.value);
      signInForm.reset();
      location.reload();
    } catch (error) {
      status.textContent = error.message || 'Sign-in failed. Try again.';
    } finally {
      button.disabled = false;
    }
  });

  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    try {
      await campaignApi.signOut();
      location.reload();
    } catch {
      status.textContent = 'Could not sign out. Try again.';
      signOut.disabled = false;
    }
  });

  browseRosters.addEventListener('click', async () => {
    rosterOptions.replaceChildren();
    chooserStatus.hidden = false;
    chooserStatus.textContent = 'Loading rosters…';
    chooser.showModal();
    try {
      const rosters = await campaignApi.listRosters();
      for (const roster of rosters) {
        const link = document.createElement('a');
        link.className = 'button';
        link.href = `roster.html?company=${roster.id}`;
        link.textContent = roster.name;
        rosterOptions.append(link);
      }
      chooserStatus.hidden = rosters.length > 0;
      chooserStatus.textContent = rosters.length ? '' : 'No rosters have been created.';
    } catch {
      chooserStatus.textContent = 'Could not load the player rosters.';
    }
  });

  try {
    const account = await campaignApi.account();
    await render(account);
    if (account) campaignApi.watchAccount(account, () => location.reload());
  } catch {
    signIn.hidden = false;
    status.textContent = 'Could not check sign-in. Try again or refresh the page.';
  }
})();
