import moment from 'moment';
import commandLineArgs from 'command-line-args';
import getUsage from 'command-line-usage';
import config from 'config';
import csv from 'csv';
import stringify from 'csv-stringify/lib/sync';

import logger from './logger'
import searchFlights from './index';

const usageDefinitions = [
  {
    header: 'A typical app',
    content: 'Generates something [italic]{very} important.'
  },
  {
    header: 'Options',
    optionList: [
      { name: 'from', alias: 'f', type: String, defaultOption: true, description: 'The home airport to search destinations from. For example "SOF".', },
      { name: 'order', alias: 'o', type: String, description: 'Order by criteria.', typeLabel: '[underline]{string} quality|price|duration', },
      // { name: 'type', alias: 't', type: String, description: 'Type of the trip.', typeLabel: '[underline]{string} return|oneways', },
      { name: 'departure', alias: 'd', type: Number, defaultValue: 0, description: 'Number of days since now to the departure to the foreign airport. Valid ISO date.' },
      { name: 'stay-duration', alias: 's', type: Number, description: 'Number of days to stay before gettings back.' },
      { name: 'flight-tolerance', alias: 't', type: Number, defaultValue: 0, description: 'Number of days after the departure/arrival date to search tickets.' },
      { name: 'airport-column-name', type: String, defaultValue: 'airport_code',description: 'Airport column name of the incomming CSV file', },
      { name: 'help', alias: 'h', type: Boolean, description: 'Print this help message' },
    ]
  }
];

let options;
try {
  options = commandLineArgs(usageDefinitions[1].optionList);
} catch(err) {
  logger.error({ err }, err.message);
  process.stdout.write(getUsage(usageDefinitions));
  process.exit(1);
}

if(options.help) {
  process.stdout.write(getUsage(usageDefinitions));
  process.exit(0);
}

try {
  if(!options.from || !options.from.length) {
    throw new Error('Missing `--from` paremeter');
  }

  if(!options.order || !['quality', 'price', 'duration'].includes(options.order)) {
    throw new Error('`--order` must be string quality|price|duration');
  }

  if(options.departure !== undefined && !(options.departure >= 0)) {
    throw new Error('`--departure-after` must be 0 or more');
  }

  options.stayDuration = options['stay-duration'];
  options.flightTolerance = options['flight-tolerance'];
  options.airportColumnName = options['airport-column-name'];

  if(options.stayDuration !== undefined && !(options.stayDuration >= 0)) {
    throw new Error('`--stay-duration` must be 0 or more');
  }

  if(options.flightTolerance !== undefined && !(options.flightTolerance >= 0)) {
    throw new Error('`--flight-tolerance` must be 0 or more');
  }

} catch(e) {
  logger.error(e.message);
  process.stdout.write(getUsage(usageDefinitions));
  process.exit(1);
}



const isRoundtrip = options.stayDuration !== undefined;
const now = moment();
const dateFrom = now.clone().add(options.departure || 0, 'd');
const dateTo = dateFrom.clone().add(options.flightTolerance || 0, 'd');
const returnFrom = dateFrom.clone().add(options.stayDuration || 0, 'd');
const returnTo = dateTo.clone().add(options.stayDuration || 0, 'd');
const flyFrom = options.from;
const typeFlight = isRoundtrip ? 'return' : 'oneway';
const sort = options.order;
const dateFormat = config.get('defaultDateFormat')

const call = {
  flyFrom,
  typeFlight,
  sort,
  dateFrom: dateFrom.format(dateFormat),
  dateTo: dateTo.format(dateFormat),
  returnFrom: returnFrom.format(dateFormat),
  returnTo: returnTo.format(dateFormat),
};

const writeOutput = (rows) => {
  const str = stringify(rows);

  process.stdout.write(str);
};

const cb = (e, routes) => {
  if(e) {
    throw e;
  }

  const csvHeaders = config.get('csvHeaders');
  const rows = [];

  for(let route of routes) {
    const row = [];

    csvHeaders.forEach((header) => {
      let val = route[ header ];

      if(Array.isArray(val)) {
        val = val.join('|');
      }

      row.push(val);
    });

    rows.push(row);
  }

  writeOutput(rows);
};

process.stdin.setEncoding('utf8');

const airportCodes = [];

process.stdin
  .pipe(csv.parse({ columns: true, }))
  .pipe(csv.transform((record) => {
    const flyTo = record[ options.airportColumnName ];

    if(flyFrom === flyTo) return;

    airportCodes.push(flyTo);
  }))
  .pipe(csv.stringify());

process.stdin.on('end', () => {
  logger.info('Finished reading from STDIN');

  searchFlights(call, airportCodes, cb);

  const str = stringify([config.get('csvHeaders')]);

  process.stdout.write(str);
});