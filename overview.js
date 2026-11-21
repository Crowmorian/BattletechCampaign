(async () => {
  const member = await campaignApi.requireMember();
  if (!member) return;
  if (member.role !== 'gm') {
    location.replace('index.html');
    return;
  }

  const byId = (id) => document.getElementById(id);
  const { companies, contract } = await campaignApi.readTableOverview();
  const companyTemplate = byId('overview-company-template');
  for (const company of companies) {
    const card = companyTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector('h2').textContent = company.name;
    companyIcons.apply(card.querySelector('.company-icon'), company);
    const units = company.roster_units;
    const ready = units.filter((unit) => !unit.inoperable).length;
    card.querySelector('.company-readiness').textContent = `${ready} of ${units.length} units available`;
    byId('overview-companies').append(card);
  }

  byId('overview-empty-contract').hidden = Boolean(contract);
  if (contract) {
    byId('overview-contract-title').textContent = contract.title;
    byId('overview-reward').textContent = `${contract.reward.toLocaleString()} SP reward`;
    campaignText.render(byId('overview-briefing'), contract.briefing);
    const template = byId('overview-objective-template');
    const labels = { active: 'Active', completed: '✓ Completed', lost: '× Lost' };
    for (const objective of contract.objectives) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.status = objective.status;
      card.querySelector('h4').textContent = objective.name;
      card.querySelector('.objective-status').textContent = labels[objective.status];
      const description = card.querySelector('.objective-description');
      campaignText.render(description, objective.description);
      description.hidden = !objective.description;
      for (const [selector, text] of [['.objective-rule', objective.rule_text], ['.objective-reward', objective.completion_reward]]) {
        const section = card.querySelector(selector);
        campaignText.render(section.querySelector('.formatted-text'), text);
        section.hidden = !text;
      }
      byId('overview-objectives').append(card);
    }
    byId('overview-empty-objectives').hidden = contract.objectives.length > 0;
    byId('overview-contract').hidden = false;
  }

  byId('overview-content').hidden = false;
  byId('overview-status').textContent = '';
})().catch(() => {
  document.getElementById('overview-status').textContent = 'Could not load the table overview. Use Refresh to try again.';
});
