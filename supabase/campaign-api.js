const campaignApi = (() => {
  const client = window.supabase.createClient(
    'https://dhnukgkgzrbneyrdprps.supabase.co',
    'sb_publishable_Ml_ewmW8e1Ld_fPrJUn5Qw_h06ImlVZ',
    {
      auth: {
        storageKey: 'battletech-supabase-session',
        detectSessionInUrl: false,
      },
    },
  );
  const files = client.storage.from('campaign-handouts');
  const table = (name) => client.from(name);

  async function checked(request) {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  }

  async function changed(request, key = 'id') {
    const row = await checked(request.select(key).maybeSingle());
    if (!row) throw new Error('This record changed or is no longer available. Refresh and try again.');
  }

  async function account() {
    const { session } = await checked(client.auth.getSession());
    if (!session) return null;
    const { user } = await checked(client.auth.getUser());
    const member = await checked(table('campaign_members').select('role').eq('user_id', user.id).maybeSingle());
    return { id: user.id, email: user.email, role: member?.role ?? null };
  }

  function signIn(email, password) {
    return checked(client.auth.signInWithPassword({ email, password }));
  }

  function signOut() {
    return checked(client.auth.signOut({ scope: 'local' }));
  }

  function watchAccount(initial, onChange) {
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION' && (session?.user.id ?? null) !== (initial?.id ?? null)) onChange();
    });
    return () => subscription.unsubscribe();
  }

  async function requireMember() {
    const member = await account();
    if (!member?.role) {
      location.replace('index.html');
      return null;
    }
    watchAccount(member, () => location.reload());
    window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
    return member;
  }

  function listRosters() {
    return checked(table('rosters').select('id, name').order('name'));
  }

  async function readRoster(user, selectedId) {
    if (user.role === 'gm' && !isUuid(selectedId)) return null;
    const query = table('rosters').select('id, name, supply, roster_units(*)');
    const row = await checked((user.role === 'gm' ? query.eq('id', selectedId) : query.eq('owner_id', user.id)).maybeSingle());
    if (!row) return null;
    const units = row.roster_units.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    return { id: row.id, name: row.name, supply: row.supply, units: units.map(readUnit) };
  }

  function isUuid(id) {
    return typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  }

  function readUnit(row) {
    return {
      id: row.id, chassis: row.chassis, variant: row.variant, type: row.unit_type,
      armorTotal: row.armor_total, armorRemaining: row.armor_remaining,
      structureTotal: row.structure_total, structureRemaining: row.structure_remaining,
      criticalHits: {
        engine: row.engine_hits, fireControl: row.fire_control_hits,
        mp: row.movement_hits, weapons: row.weapon_hits,
      },
      legacyCriticalHits: row.legacy_critical_hits, inoperable: row.inoperable,
    };
  }

  async function saveUnit(rosterId, unit, editingId) {
    const values = {
      chassis: unit.chassis, variant: unit.variant, unit_type: unit.type,
      armor_total: unit.armorTotal, armor_remaining: unit.armorRemaining,
      structure_total: unit.structureTotal, structure_remaining: unit.structureRemaining,
      engine_hits: unit.criticalHits.engine ?? 0,
      fire_control_hits: unit.criticalHits.fireControl ?? 0,
      movement_hits: unit.criticalHits.mp ?? 0, weapon_hits: unit.criticalHits.weapons ?? 0,
      legacy_critical_hits: unit.legacyCriticalHits ?? [], inoperable: unit.inoperable,
    };
    const query = editingId
      ? table('roster_units').update(values).eq('id', editingId).eq('roster_id', rosterId)
      : table('roster_units').insert({ ...values, roster_id: rosterId });
    return readUnit(await checked(query.select().single()));
  }

  async function readContracts() {
    const [offers, state, objectives] = await Promise.all([
      checked(table('contracts').select('id, title, briefing, reward, visible').order('created_at').order('id')),
      checked(table('campaign_state').select('current_contract_id').single()),
      checked(table('contract_objectives').select('id, contract_id, name, status').order('created_at').order('id')),
    ]);
    return {
      currentId: state.current_contract_id,
      offers: offers.map((offer) => ({
        ...offer, objectives: objectives.filter((objective) => objective.contract_id === offer.id),
      })),
    };
  }

  function setCurrentContract(next, previous) {
    const query = table('campaign_state').update({ current_contract_id: next }).eq('singleton', true);
    return changed(previous ? query.eq('current_contract_id', previous) : query.is('current_contract_id', null), 'singleton');
  }

  async function readHandouts() {
    const rows = await checked(table('handouts').select('id, title, body, visible, handout_games(name), handout_images(id, filename, object_path)'));
    return rows.map(({ handout_games: game, handout_images: images, ...row }) => ({
      ...row, game: game?.name ?? null, images,
    }));
  }

  async function getGameId(name) {
    async function find() {
      const games = await checked(table('handout_games').select('id, name'));
      return games.find((game) => game.name.trim().toLowerCase() === name.toLowerCase())?.id;
    }
    const existing = await find();
    if (existing) return existing;
    try {
      return (await checked(table('handout_games').insert({ name }).select('id').single())).id;
    } catch (error) {
      if (error.code !== '23505') throw error;
      const concurrent = await find();
      if (!concurrent) throw error;
      return concurrent;
    }
  }

  async function addHandoutImage(handoutId, file) {
    const asset = await checked(table('handout_images').insert({ handout_id: handoutId, filename: file.name })
      .select('id, filename, object_path').single());
    try {
      await checked(files.upload(asset.object_path, file, { contentType: file.type }));
      return asset;
    } catch (error) {
      await removeHandoutImages([asset]);
      throw error;
    }
  }

  async function removeHandoutImages(images) {
    if (!images.length) return;
    await checked(files.remove(images.map((image) => image.object_path)));
    await checked(table('handout_images').delete().in('id', images.map((image) => image.id)));
  }

  async function deleteHandout(id) {
    await changed(table('handouts').update({ visible: false }).eq('id', id));
    const images = await checked(table('handout_images').select('id, object_path').eq('handout_id', id));
    await removeHandoutImages(images);
    await changed(table('handouts').delete().eq('id', id));
  }

  return {
    account, signIn, signOut, watchAccount, requireMember, listRosters, readRoster, saveUnit,
    saveSupply: (id, supply) => changed(table('rosters').update({ supply }).eq('id', id)),
    setInoperable: (id, value) => changed(table('roster_units').update({ inoperable: value }).eq('id', id)),
    removeUnit: (rosterId, id) => changed(table('roster_units').delete().eq('id', id).eq('roster_id', rosterId)),
    readContracts, setCurrentContract,
    createContract: (values) => checked(table('contracts').insert(values).select('id').single()),
    editContract: (id, values) => changed(table('contracts').update(values).eq('id', id)),
    showContract: (id, visible) => changed(table('contracts').update({ visible }).eq('id', id).eq('visible', !visible)),
    addObjective: (contractId, name) => checked(table('contract_objectives').insert({ contract_id: contractId, name })),
    setObjectiveStatus: (id, status, previous) => changed(table('contract_objectives').update({ status }).eq('id', id).eq('status', previous)),
    readHandouts, addHandoutImage, removeHandoutImages, deleteHandout,
    createHandout: (values) => checked(table('handouts').insert(values).select('id').single()),
    editHandout: (id, values) => changed(table('handouts').update(values).eq('id', id)),
    showHandout: (id, visible) => changed(table('handouts').update({ visible }).eq('id', id).eq('visible', !visible)),
    archiveHandout: async (id, game) => changed(table('handouts').update({ game_id: await getGameId(game) }).eq('id', id).is('game_id', null)),
    downloadHandoutImage: (path) => checked(files.download(path)),
    readInfluence: () => checked(table('faction_influence').select('id, name, score').order('created_at').order('id')),
    addFaction: (name) => checked(table('faction_influence').insert({ name }).select('id').single()),
    setInfluence: (id, score, previous) => changed(table('faction_influence').update({ score }).eq('id', id).eq('score', previous)),
    removeFaction: (id) => changed(table('faction_influence').delete().eq('id', id)),
  };
})();
