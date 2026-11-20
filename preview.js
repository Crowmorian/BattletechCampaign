const campaignPreview = (() => {
  const accountKey = 'battletech-preview-account';
  const rosterKey = 'battletech-player-sheet-v1';
  const contractsKey = 'battletech-preview-contracts';
  const companies = { rook: 'Rook Company', kestrel: 'Kestrel Lance' };

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function account() {
    const value = read(accountKey);
    return value === 'gm' || Object.hasOwn(companies, value) ? value : null;
  }

  function requireAccount() {
    const signedIn = account();
    if (!signedIn) location.replace('index.html');
    return signedIn;
  }

  function watchAccount(initialAccount) {
    window.addEventListener('storage', (event) => {
      if ((event.key === accountKey || event.key === null) && account() !== initialAccount) location.reload();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && account() !== initialAccount) location.reload();
    });
  }

  return {
    companies, account, requireAccount, watchAccount,
    signIn: (value) => write(accountKey, value),
    signOut: () => localStorage.removeItem(accountKey),
    readRosters: () => read(rosterKey),
    saveRosters: (value) => write(rosterKey, value),
    readContracts: () => read(contractsKey),
    saveContracts: (value) => write(contractsKey, value),
    watchContracts: (refresh) => {
      window.addEventListener('storage', (event) => {
        if (event.key === contractsKey || event.key === null) refresh();
      });
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) refresh();
      });
    },
  };
})();
