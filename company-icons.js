const companyIcons = (() => {
  const icons = new Map([
    ['three angry accountants', 'Assets/companies/company1.jpg'],
    ['last argument', 'Assets/companies/company2.jpg'],
  ]);

  return {
    apply(image, company) {
      const name = company.name.trim().toLowerCase().replace(/^the\s+/, '');
      image.src = icons.get(name) ?? 'Assets/mech_icon.png';
    },
  };
})();
