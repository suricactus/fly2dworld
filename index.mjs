import querystring from 'querystring';
import request from 'superagent';
import config from 'config';
import assert from 'assert';
import moment from 'moment';
import humanizeDuration from 'pretty-ms';

import logger from './logger';

const dateFormat = config.get('defaultDateFormat')

const diffrenceSec = (a, b) => {
  return moment.duration(moment(a).diff(moment(b))).asSeconds();
};

const coords = (lat, lng) => {
  return [lat, lng].join(',');
}

const populateMe = (type, routes, row) => {
  if(routes.length === 0) return row;

  row[ type + 'Routes'] = [];
  row[ type + 'Airlines'] = [];
  row[ type + 'DepartureTimes'] = [];
  row[ type + 'ArrivalTimes'] = [];
  row[ type + 'AirportCoordinates'] = [];
  row[ type + 'AirportCodes'] = [];
  row[ type + 'Cities'] = [];
  row[ type + 'CountryCodes'] = [];
  row[ type + 'FlightDurations'] = [];
  row[ type + 'GroundDurations'] = [];

  routes
    .forEach((route, idx) => {
      row[ type + 'Airlines'].push(route.airline);
      row[ type + 'DepartureTimes'].push(route.startsAt);
      row[ type + 'ArrivalTimes'].push(route.endsAt);
      row[ type + 'AirportCoordinates'].push(route.coordsFrom);
      row[ type + 'AirportCodes'].push(route.flyFrom);
      row[ type + 'Cities'].push(route.cityFrom);
      row[ type + 'CountryCodes'].push(route.countryCodeFrom);
      row[ type + 'FlightDurations'].push(route.durationSec);

      if(idx) {
        const prevRoute = routes[ idx - 1 ];
        const duration = diffrenceSec(route.startsAt, prevRoute.endsAt);
        row[ type + 'GroundDurations'].push(duration);
      }
    });

  const firstRoute = routes[0];
  const lastRoute = routes[routes.length - 1];

  row[ type + 'AirportCoordinates'].push(lastRoute.coordsTo);
  row[ type + 'AirportCodes'].push(lastRoute.flyTo);
  row[ type + 'Cities'].push(lastRoute.cityTo);
  row[ type + 'CountryCodes'].push(lastRoute.countryCodeTo);

  row[ type + 'DurationSec'] = diffrenceSec(lastRoute.endsAt, firstRoute.startsAt);
  row[ type + 'ConnectionsCount'] = routes.length - 1;
  row[ type + 'StartsAt'] = firstRoute.startsAt;
  row[ type + 'EndsAt'] = lastRoute.endsAt;

  row[ type + 'GroundDurationSec'] = row[ type + 'GroundDurations'].reduce((dest, el) => { return dest += el; }, 0);
  row[ type + 'FlightDurationSec'] = row[ type + 'FlightDurations'].reduce((dest, el) => { return dest += el; }, 0);

  return row;
};

const guessCountry = (str) => {
  const splitted = str.split('_');
  return splitted[ splitted.length - 1 ].toUpperCase();
};

const makeApiReq = (q) => {
  const url = `${config.get('url')}?${querystring.stringify({
    v: 3,
    ...q,
  })}`;
  logger.debug('Requesting %s', url, 'with options', q);
  // return {
    // body: { data: [], },
    // body: config.get('data'),
  // };
  return request.get(url)
    .accept('application/json');
}


const parseRawResp = (resp, additional) => {
  const rows = [];

  for (let d of resp.data) {
    const row = { ...additional };

    row.airportCodeFrom = d.flyFrom;
    row.ids = d.id;
    row.quality = d.quality;
    row.airportCodeTo = d.flyTo;
    row.cityFrom = d.cityFrom;
    row.cityTo = d.cityTo;
    row.countryTo = d.countryTo.name;
    row.countryCodeTo = d.countryTo.code;
    row.countryFrom = d.countryFrom.name;
    row.countryCodeFrom = d.countryFrom.code;

    row.currency = config.get('defaultCurrency');
    row.price = d.price;
    row.totalDistanceKm = d.distance;
    row.totalDuration = d.fly_duration;

    const routes = [];

    for(let routeRaw of d.route) {
      const duration = routeRaw.aTimeUTC - routeRaw.dTimeUTC;
      const isReturn = !!routeRaw.return;
      const countryCodeTo = guessCountry(routeRaw.mapIdto);
      const countryCodeFrom = guessCountry(routeRaw.mapIdfrom);

      const route = {
        isReturn,
        countryCodeTo,
        countryCodeFrom,
        coordsFrom: coords(routeRaw.latFrom, routeRaw.lngFrom),
        coordsTo: coords(routeRaw.latTo, routeRaw.lngTo),
        cityTo: routeRaw.cityTo,
        cityFrom: routeRaw.cityFrom,
        flyFrom: routeRaw.flyFrom,
        flyTo: routeRaw.flyTo,
        airline: routeRaw.airline,
        durationSec: duration,
        duration: humanizeDuration(duration * 1000),
        startsAt: new Date(routeRaw.dTimeUTC * 1000).toISOString(),
        endsAt: new Date(routeRaw.aTimeUTC * 1000).toISOString(),
      };

      routes.push(route);
    }

    const arrivalRoutes = routes.filter(r => !r.isReturn);
    const departureRoutes = routes.filter(r => r.isReturn);

    row.coordsFrom = arrivalRoutes[0].coordsFrom;
    row.coordsTo = routes[routes.length - 1].coordsTo;

    populateMe('all', routes, row);
    populateMe('arrival', arrivalRoutes, row);
    populateMe('departure', departureRoutes, row);

    row.totalForeignDurationSec = departureRoutes.length > 0
      ? diffrenceSec(departureRoutes[0].startsAt, arrivalRoutes[ arrivalRoutes.length - 1 ].endsAt)
      : null;
    row.totalMissingDurationSec = departureRoutes.length > 0
      ? diffrenceSec(departureRoutes[ arrivalRoutes.length - 1 ].endsAt, arrivalRoutes[0].startsAt)
      : null;

    row.allConnectionsCount += departureRoutes.length > 0 ? -1 : 0
    row.totalTravelDurationSec = row.arrivalDurationSec + (row.departureDurationSec || 0);

    rows.push(row);
  }

  logger.debug({ rows }, 'Parsed all rows');

  return rows;
}

async function getRoutes(opts) {
  const rows = [];
  let resp;
  let parsed;

  try {
    resp = await makeApiReq({
      flyFrom: opts.flyFrom,
      to: opts.flyTo,
      typeFlight: opts.typeFlight,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      returnFrom: opts.returnFrom,
      returnTo: opts.returnTo,
      sort: opts.sort,
      locale: config.get('defaultLocale'),
      adults: config.get('adults'),
      limit: config.get('defaultLimit'),
    });

    assert(resp.body && typeof resp.body === 'object', 'Missing response body');

    logger.debug({ headers: resp.headers, }, 'Response headers')
  } catch(err) {
    logger.error({ err }, 'Failed to get a response:', err.message);
    throw err;
  }

  try {
    parsed = parseRawResp(resp.body, {
      _obtainedAt: new Date().toISOString(),
      _qDateFrom: moment(opts.dateFrom, dateFormat).toISOString(),
      _qDateTo: moment(opts.dateTo, dateFormat).toISOString(),
      _qReturnFrom: moment(opts.returnFrom, dateFormat).toISOString(),
      _qReturnTo: moment(opts.returnTo, dateFormat).toISOString(),
      _qSort: opts.sort,
    });
  } catch(err) {
    logger.error({ err }, 'Failed to parse the response:', err.message);
    throw err;
  }

  return parsed;
}

export default async function searchFlights (opts, destinations, cb) {
  logger.info('Search starts with options', opts, 'and destinations', destinations);

  for(let dest of destinations) {
    let routes;

    try {
      routes = await getRoutes({
        ...opts,
        flyTo: dest,
      });

      if(routes.length) {
        logger.info('Parsed %s routes for %s', routes.length, dest);
      } else {
        logger.warn({ code: 'NO_RESULTS', dest }, 'Parsed %s routes for %s', routes.length, dest);
      }
    } catch(err) {
      logger.error({ err }, 'Error while getting routes');
      cb(err);
      return;
    }

    logger.debug('Successfully got routes for destination "%s"', dest);
    cb(null, routes, opts);
  }

}
