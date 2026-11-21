const companyIcons = (() => {
  const icons = new Map([
    ['11c6cc7a-cf40-40e7-b849-3c4011ff9f3e', 'Assets/companies/company1.jpg'],
    ['af182d4a-b023-4b4f-ab7e-216cf3a51eb1', 'Assets/companies/company2.jpg'],
  ]);

  return {
    apply(image, company) {
      image.src = icons.get(company.id) ?? 'Assets/mech_icon.png';
    },
  };
})();
