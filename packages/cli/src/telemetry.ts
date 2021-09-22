import { networkInterfaces } from 'os';
import { randomBytes, createHash, BinaryLike } from 'crypto';
import * as os from 'os';
import { name, version } from '../package.json';
import {
  TelemetryClient,
  setup as AppInsights,
  defaultClient as AppInsightsClient,
} from 'applicationinsights';
import Conf from 'conf';

const config = new Conf();
const invalidMacAddresses = new Set([
  '00:00:00:00:00:00',
  'ff:ff:ff:ff:ff:ff',
  'ac:de:48:00:11:22',
]);

// This key is meant to be publically shared. However, I'm adding a simple
// obfuscation to mitigate key scraping bots on GitHub. The key is split on
// hypens and base64 encoded without padding.
// key.split('-').map((x) => x.toString('base64').replace(/=*/, ''))
const INSTRUMENTATION_KEY = [
  'NTBjMWE1YzI',
  'NDliNA',
  'NDkxMw',
  'YjdjYw',
  'ODZhNzhkNDA3NDVm',
]
  .map((x) => Buffer.from(x, 'base64').toString('utf8'))
  .join('-');

function getMachineId(): string {
  const machineId = config.get('machineId') as string | undefined;
  if (machineId) {
    return machineId;
  }

  let machineIdSource: BinaryLike | undefined;

  // Derive a machine ID from the first network interface
  machineIdSource = Object.values(networkInterfaces())
    .flat()
    .map((iface) => iface?.mac)
    .filter((mac) => mac && !invalidMacAddresses.has(mac))
    .shift();

  if (!machineIdSource) {
    // Fallback to a random string
    machineIdSource = randomBytes(32);
  }

  const machineIdHash = createHash('sha256')
    .update(machineIdSource as BinaryLike)
    .digest('hex');

  config.set('machineId', machineIdHash);

  return machineIdHash;
}

class Session {
  public id: string;
  public expiration: number;

  constructor() {
    const sessionId = config.get('sessionId') as string | undefined;
    const sessionExpiration = config.get('sessionExpiration') as
      | number
      | undefined;

    if (
      sessionId &&
      sessionExpiration &&
      !Session.beyondExpiration(sessionExpiration)
    ) {
      this.id = sessionId;
      this.expiration = sessionExpiration;
    } else {
      this.id = Session.newSessionId();
      this.expiration = Session.expirationFromNow();
      config.set('sessionId', this.id);
      config.set('sessionExpiration', this.expiration);
    }
  }

  static beyondExpiration(expiration: number): boolean {
    return expiration <= Date.now();
  }

  static expirationFromNow(): number {
    return Date.now() + 1000 * 60 * 30;
  }

  static newSessionId(): string {
    return createHash('sha256').update(randomBytes(32)).digest('hex');
  }

  touch(): void {
    this.expiration = Session.expirationFromNow();
    config.set('sessionExpiration', this.expiration);
  }

  get valid(): boolean {
    return !Session.beyondExpiration(this.expiration);
  }
}

interface TelemetryData {
  name: string;
  properties?: Record<string, string | undefined>;
  metrics?: Record<string, number | undefined>;
}

const propPrefix = 'appmap.cli.';
/**
 * Append `appmap.cli.` to the name of each property and drop undefined values
 */
const transformProps = <T>(
  obj: Record<string, T | undefined>
): Record<string, T> =>
  Object.entries(obj).reduce((memo, [k, v]) => {
    const prefixedKey = k.startsWith('appmap.cli.') ? k : `${propPrefix}${k}`;
    if (v !== undefined) {
      memo[prefixedKey] = v;
    }

    return memo;
  }, {});

export default class Telemetry {
  private static _session?: Session;
  private static _client?: TelemetryClient;
  private static debug = process.env.APPMAP_TELEMETRY_DEBUG !== undefined;
  private static _enabled = process.env.APPMAP_TELEMETRY_DISABLED === undefined;
  public static readonly machineId = getMachineId();

  static get enabled(): boolean {
    return this._enabled;
  }

  static get session(): Session {
    if (!this._session?.valid) {
      this._session = new Session();
    }

    return this._session as Session;
  }

  static get client(): TelemetryClient {
    if (!this._client) {
      // Do not allow Application Insights to try and collect additional metadata
      process.env.APPLICATION_INSIGHTS_NO_STATSBEAT = '1';

      // Disable everything we can, we don't any additional collection from Application Insights.
      AppInsights(INSTRUMENTATION_KEY)
        .setAutoCollectRequests(false)
        .setAutoCollectPerformance(false)
        .setAutoCollectExceptions(false)
        .setAutoCollectDependencies(false)
        .setAutoCollectHeartbeat(false)
        .setAutoDependencyCorrelation(false)
        .setAutoCollectConsole(false)
        .setInternalLogging(false, false)
        .setSendLiveMetrics(false)
        .setUseDiskRetryCaching(true);

      const client = new TelemetryClient(INSTRUMENTATION_KEY);
      client.context.tags[client.context.keys.userId] = Telemetry.machineId;
      client.context.tags[client.context.keys.sessionId] = Telemetry.session.id;
      client.context.tags[client.context.keys.cloudRole] = name;
      client.setAutoPopulateAzureProperties(false);

      this._client = client;
    }

    return this._client;
  }

  static async sendEvent(data: TelemetryData): Promise<void> {
    return new Promise((resolve) => {
      try {
        const transformedProperties = transformProps(data.properties || {});
        const transformedMetrics = transformProps(data.metrics || {});
        const properties = {
          'common.source': name,
          'common.os': os.platform(),
          'common.platformversion': os.release(),
          'common.arch': os.arch(),
          'appmap.cli.version': version,
          'appmap.cli.machineId': Telemetry.machineId,
          'appmap.cli.sessionId': Telemetry.session.id,
          'appmap.cli.args': process.argv.slice(1).join(' '),
          ...transformedProperties,
        };

        const event = {
          name: `${name}/${data.name}`,
          measurements: transformedMetrics,
          properties,
        };

        if (this.debug) {
          console.log(JSON.stringify(event, null, 2));
        }

        if (this.enabled) {
          Telemetry.client.trackEvent(event);
          Telemetry.session.touch();
          Telemetry.client.flush({ callback: () => resolve() });
        } else {
          resolve();
        }
      } catch (e) {
        // Don't let telemetry fail the entire command
        // Do nothing other than log for now, we can't do anything about it
        if (this.debug) {
          if (e instanceof Error) {
            console.error(e.stack);
          } else {
            console.error(e);
          }
        }

        resolve();
      }
    });
  }
}
