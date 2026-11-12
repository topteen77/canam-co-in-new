import crypto from 'node:crypto';
import db from '../db.js';

let ensured = false;

function newId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `loc-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

async function addColumnIfMissing(table, column, ddl) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number(rows[0]?.cnt || 0) === 0) {
    await db.query(`ALTER TABLE \`${table}\` ${ddl}`);
  }
}

export async function ensureLocationMasterTables() {
  if (ensured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS location_states (
      id VARCHAR(64) PRIMARY KEY,
      country VARCHAR(128) NOT NULL,
      name VARCHAR(128) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_location_states_country_name (country, name),
      INDEX idx_location_states_country (country)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS location_cities (
      id VARCHAR(64) PRIMARY KEY,
      country VARCHAR(128) NOT NULL,
      \`state\` VARCHAR(128) NOT NULL,
      name VARCHAR(128) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_location_cities_country_name (country, name),
      INDEX idx_location_cities_state (country, \`state\`),
      INDEX idx_location_cities_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await addColumnIfMissing('location_states', 'country', "ADD COLUMN country VARCHAR(128) NOT NULL DEFAULT 'India'");
  await addColumnIfMissing('location_states', 'name', "ADD COLUMN name VARCHAR(128) NOT NULL DEFAULT ''");
  await addColumnIfMissing('location_states', 'is_active', 'ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing('location_cities', 'country', "ADD COLUMN country VARCHAR(128) NOT NULL DEFAULT 'India'");
  await addColumnIfMissing('location_cities', 'state', "ADD COLUMN `state` VARCHAR(128) NOT NULL DEFAULT ''");
  await addColumnIfMissing('location_cities', 'name', "ADD COLUMN name VARCHAR(128) NOT NULL DEFAULT ''");
  await addColumnIfMissing('location_cities', 'is_active', 'ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
  ensured = true;
}

export async function listStates({ country, q } = {}) {
  await ensureLocationMasterTables();
  const where = ['is_active = 1'];
  const params = [];
  if (country) {
    where.push('country = ?');
    params.push(clean(country));
  }
  if (q) {
    where.push('name LIKE ?');
    params.push(`%${clean(q)}%`);
  }
  const [rows] = await db.query(
    `SELECT id, country, name, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
     FROM location_states
     WHERE ${where.join(' AND ')}
     ORDER BY country ASC, name ASC`,
    params
  ); // name/country are plain identifiers here
  return rows || [];
}

export async function listCities({ country, state, q } = {}) {
  await ensureLocationMasterTables();
  const where = ['is_active = 1'];
  const params = [];
  if (country) {
    where.push('country = ?');
    params.push(clean(country));
  }
  if (state) {
    where.push('`state` = ?');
    params.push(clean(state));
  }
  if (q) {
    where.push('(name LIKE ? OR `state` LIKE ?)');
    params.push(`%${clean(q)}%`, `%${clean(q)}%`);
  }
  const [rows] = await db.query(
    `SELECT id, country, \`state\` AS state, name, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
     FROM location_cities
     WHERE ${where.join(' AND ')}
     ORDER BY country ASC, \`state\` ASC, name ASC`,
    params
  );
  return rows || [];
}

export async function getLocationBundle() {
  const [states, cities] = await Promise.all([listStates(), listCities()]);
  const statesByCountry = {};
  states.forEach((row) => {
    const country = clean(row.country);
    if (!statesByCountry[country]) statesByCountry[country] = [];
    statesByCountry[country].push(clean(row.name));
  });
  const cityToState = {};
  cities.forEach((row) => {
    cityToState[clean(row.name)] = clean(row.state);
  });
  return { statesByCountry, cityToState, states, cities };
}

export async function upsertState({ id, country, name, isActive = true }) {
  await ensureLocationMasterTables();
  const countryName = clean(country);
  const stateName = clean(name);
  if (!countryName || !stateName) throw Object.assign(new Error('Country and state name are required'), { statusCode: 400 });

  const rowId = clean(id) || newId();
  const [existing] = await db.query(
    `SELECT id FROM location_states WHERE (id = ?) OR (country = ? AND LOWER(name) = LOWER(?)) LIMIT 1`,
    [rowId, countryName, stateName]
  );
  if (existing.length) {
    await db.execute(
      `UPDATE location_states
       SET country = ?, name = ?, is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [countryName, stateName, isActive ? 1 : 0, existing[0].id]
    );
    return { success: true, id: existing[0].id };
  }
  await db.execute(
    `INSERT INTO location_states (id, country, name, is_active) VALUES (?, ?, ?, ?)`,
    [rowId, countryName, stateName, isActive ? 1 : 0]
  );
  return { success: true, id: rowId };
}

export async function deleteState(id) {
  await ensureLocationMasterTables();
  const rowId = clean(id);
  if (!rowId) throw Object.assign(new Error('State id is required'), { statusCode: 400 });
  const [rows] = await db.query(`SELECT country, name FROM location_states WHERE id = ?`, [rowId]);
  if (!rows.length) return { success: true, deleted: 0 };
  const { country, name } = rows[0];
  const [cityCount] = await db.query(
    `SELECT COUNT(*) AS cnt FROM location_cities WHERE country = ? AND \`state\` = ? AND is_active = 1`,
    [country, name]
  );
  if (Number(cityCount[0]?.cnt || 0) > 0) {
    throw Object.assign(new Error('Remove or reassign cities in this state first'), { statusCode: 400 });
  }
  await db.execute(`UPDATE location_states SET is_active = 0, updated_at = NOW() WHERE id = ?`, [rowId]);
  return { success: true, deleted: 1 };
}

export async function upsertCity({ id, country, state, name, isActive = true, syncLeads = true }) {
  await ensureLocationMasterTables();
  const countryName = clean(country);
  const stateName = clean(state);
  const cityName = clean(name);
  if (!countryName || !stateName || !cityName) {
    throw Object.assign(new Error('Country, state, and city name are required'), { statusCode: 400 });
  }

  const rowId = clean(id) || newId();
  const [existing] = await db.query(
    `SELECT id, \`state\` AS state FROM location_cities WHERE (id = ?) OR (country = ? AND LOWER(name) = LOWER(?)) LIMIT 1`,
    [rowId, countryName, cityName]
  );

  let cityId = rowId;
  if (existing.length) {
    cityId = existing[0].id;
    await db.execute(
      `UPDATE location_cities
       SET country = ?, \`state\` = ?, name = ?, is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [countryName, stateName, cityName, isActive ? 1 : 0, cityId]
    );
  } else {
    await db.execute(
      `INSERT INTO location_cities (id, country, \`state\`, name, is_active) VALUES (?, ?, ?, ?, ?)`,
      [cityId, countryName, stateName, cityName, isActive ? 1 : 0]
    );
  }

  let syncedLeads = 0;
  if (syncLeads) {
    syncedLeads = await syncLeadContactsForCity(cityName, stateName, countryName);
  }
  return { success: true, id: cityId, syncedLeads };
}

export async function deleteCity(id) {
  await ensureLocationMasterTables();
  const rowId = clean(id);
  if (!rowId) throw Object.assign(new Error('City id is required'), { statusCode: 400 });
  await db.execute(`UPDATE location_cities SET is_active = 0, updated_at = NOW() WHERE id = ?`, [rowId]);
  return { success: true, deleted: 1 };
}

async function syncLeadContactsForCity(cityName, stateName, countryName) {
  try {
    const [rows] = await db.query(`SELECT id, contacts FROM leads WHERE contacts IS NOT NULL AND contacts != '' AND contacts != '[]'`);
    let updated = 0;
    for (const row of rows || []) {
      let contacts;
      try {
        contacts = typeof row.contacts === 'string' ? JSON.parse(row.contacts) : row.contacts;
      } catch {
        continue;
      }
      if (!Array.isArray(contacts) || !contacts.length) continue;
      let changed = false;
      const next = contacts.map((contact) => {
        if (!contact || typeof contact !== 'object') return contact;
        const contactCity = clean(contact.city);
        if (!contactCity || contactCity.toLowerCase() !== cityName.toLowerCase()) return contact;
        const nextContact = { ...contact, state: stateName };
        if (countryName && !clean(contact.country)) nextContact.country = countryName;
        if (
          clean(contact.state).toLowerCase() !== stateName.toLowerCase() ||
          (countryName && !clean(contact.country))
        ) {
          changed = true;
        }
        return nextContact;
      });
      if (!changed) continue;
      await db.execute(`UPDATE leads SET contacts = ? WHERE id = ?`, [JSON.stringify(next), row.id]);
      updated += 1;
    }
    return updated;
  } catch (error) {
    console.error('syncLeadContactsForCity failed:', error.message);
    return 0;
  }
}

const CHANDIGARH_CORRECTIONS = [
  { country: 'India', state: 'Chandigarh', name: 'Chandigarh' },
  { country: 'India', state: 'Haryana', name: 'Panchkula' },
  { country: 'India', state: 'Punjab', name: 'Zirakpur' },
  { country: 'India', state: 'Punjab', name: 'Lalru' },
  { country: 'India', state: 'Punjab', name: 'Raman Mandi' },
  { country: 'India', state: 'Punjab', name: 'Mohali' },
];

export async function repairKnownCityMappings({ syncLeads = false } = {}) {
  await ensureLocationMasterTables();
  for (const row of CHANDIGARH_CORRECTIONS) {
    await upsertCity({ ...row, isActive: true, syncLeads });
  }
  return { repaired: CHANDIGARH_CORRECTIONS.length };
}

export async function seedDefaultsIfEmpty(seed) {
  await ensureLocationMasterTables();
  const [stateCount] = await db.query(`SELECT COUNT(*) AS cnt FROM location_states`);
  const [cityCount] = await db.query(`SELECT COUNT(*) AS cnt FROM location_cities`);
  const hasStates = Number(stateCount[0]?.cnt || 0) > 0;
  const hasCities = Number(cityCount[0]?.cnt || 0) > 0;

  const statesByCountry = seed?.statesByCountry || {};
  const cityToState = seed?.cityToState || {};

  if (!hasStates) {
    for (const [country, states] of Object.entries(statesByCountry)) {
      for (const name of states || []) {
        await upsertState({ country, name, isActive: true });
      }
    }
  }
  if (!hasCities) {
    for (const [city, state] of Object.entries(cityToState)) {
      const country =
        Object.keys(statesByCountry).find((c) =>
          (statesByCountry[c] || []).some((s) => String(s).toLowerCase() === String(state).toLowerCase())
        ) || 'India';
      await upsertCity({ country, state, name: city, isActive: true, syncLeads: false });
    }
  }

  await repairKnownCityMappings();
  return { seeded: !(hasStates && hasCities) };
}
