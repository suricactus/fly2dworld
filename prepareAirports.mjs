import sqlite from 'sqlite';
import config from 'config';
import assert from 'assert';
import csv from 'fast-csv';

const csvStream = csv.createWriteStream({ headers: true, });
const dbPromise = sqlite.open('./setup/airports_temp.db', sqlite.OPEN_READONLY);

csvStream.pipe(process.stdout);

start();

async function start() {
  const db = await dbPromise;
  const lgAirports = await db.all(`SELECT * FROM airports WHERE type = 'large_airport' AND  iata_code IS NOT NULL AND iata_code <> ''`);

  for (let airport of lgAirports) {
    csvStream.write(airport);
  }

  const countriesWithoutLargeAirports = await db.all(`SELECT * FROM cwa_not_l`);

  for (let country of countriesWithoutLargeAirports) {
    const capital = await db.get(`SELECT * FROM capitals WHERE code = ?`, [country.code]);
    const capitalCoordsChecksum = Math.pow(capital.lat, 2) + Math.pow(capital.lng, 2);
    const value = await closest(db, country.code, capitalCoordsChecksum);

    if(!value) {
      console.error('Unable to find data in ', country.code)
      continue;
    }

    csvStream.write(value);
  }

  csvStream.end();
}

async function closest(db, countryCode, checksum) {
  const airport = await db.get(`
    SELECT *, abs(checksum - ?) AS ordering
    FROM (
      SELECT *
      FROM (
        SELECT
          *,
          lat * lat + lng * lng AS checksum
        FROM airports_without_l
        WHERE 1
          AND code = ?
          AND checksum <= ?
          AND iata_code <> ''
          AND iata_code IS NOT NULL
        ORDER BY checksum DESC
        LIMIT 1
      ) foo1
      UNION
      SELECT *
      FROM (
        SELECT
          *,
          lat * lat + lng * lng AS checksum
        FROM airports_without_l
        WHERE 1
          AND code = ?
          AND checksum >= ?
          AND iata_code <> ''
          AND iata_code IS NOT NULL
        ORDER BY checksum ASC
        LIMIT 1
      ) foo2
    ) bar
    ORDER BY ordering ASC
    LIMIT 1
    `, [checksum, countryCode, checksum, countryCode, checksum]);

  return airport;
}
