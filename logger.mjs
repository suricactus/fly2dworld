import bunyan from 'bunyan';
import bunyanFormat from 'bunyan-format';

const formatOut = bunyanFormat({ outputMode: 'short', }, process.stderr);
const logger = bunyan.createLogger({
  name: 'flyAway',
  streams: [{
    level: 'debug',
    stream: formatOut,
  }, {
    level: 'debug',
    path: 'remote_calls.log'
  }]
});

export default logger;