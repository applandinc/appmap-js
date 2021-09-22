import sinon, { SinonSpy } from 'sinon';
import Conf from 'conf';
import * as os from 'os';
import Telemetry from '../../src/telemetry';
import { name as appName, version } from '../../package.json';

const sandbox = sinon.createSandbox();
const invalidExpiration = () => Date.now() - 1000 * 60 * 60;

describe('telemetry', () => {
  beforeAll(() => {
    // Don't accidentally send data
    sinon.stub(Telemetry, 'client').value({
      trackEvent: sinon.stub(),
      flush: sinon.stub(),
    });

    // Don't persist data locally
    sinon.stub(Conf.prototype, 'set');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Session', () => {
    it('writes persistent session data', () => {
      const setStub = Conf.prototype.set as SinonSpy;
      const { session } = Telemetry;

      expect(setStub.getCall(-2).args[1]).toBe(session.id);
      expect(setStub.getCall(-1).args[1]).toBe(session.expiration);
    });

    it('reads persistent session data', () => {
      const expiration = Date.now() + 1000;
      const conf = sandbox.stub(Conf.prototype, 'get');
      conf.withArgs(sinon.match('sessionId')).returns('sessionId');
      conf.withArgs(sinon.match('sessionExpiration')).returns(expiration);

      // Force a new session
      Telemetry.session.expiration = invalidExpiration();

      const { session } = Telemetry;
      expect(session.id).toBe('sessionId');
      expect(session.expiration).toBe(expiration);
    });

    it('issues a new session once an existing session has expired', () => {
      const conf = sandbox.stub(Conf.prototype, 'get');
      conf.withArgs(sinon.match('sessionId')).returns(undefined);
      const firstSession = Telemetry.session;
      const firstSessionId = firstSession.id;

      expect(firstSession.valid).toBe(true);
      sandbox.stub(firstSession, 'expiration').value(invalidExpiration());
      expect(firstSession.valid).toBe(false);

      const secondSession = Telemetry.session;
      expect(firstSession).not.toBe(secondSession);
      expect(secondSession.id).not.toBe(firstSessionId);
      expect(secondSession.valid).toBe(true);
      expect(secondSession.expiration).toBeGreaterThan(Date.now());
    });

    it('updates the expiration when the session is touched', async () => {
      const { session } = Telemetry;
      const sessionExpiration = session.expiration;

      // Guarantee the session expiration should change once the telemetry is sent
      await new Promise((r) => setTimeout(r, 16));

      session.touch();

      expect(sessionExpiration).not.toBe(Telemetry.session.expiration); // session should have been updated
      expect(session).toBe(Telemetry.session); // session should be the same
    });
  });

  describe('Telemetry', () => {
    beforeEach(() => {
      sandbox.stub(Telemetry, 'enabled').get(() => true);
    });

    it('sends the expected telemetry data', () => {
      const trackEvent = Telemetry.client.trackEvent as sinon.SinonStub;
      Telemetry.sendEvent({
        name: 'test',
        properties: { prop: 'value' },
        metrics: { metric: 1 },
      });

      const [[{ name, properties, measurements }]] = trackEvent.args;

      if (!properties) {
        throw new Error('properties not found');
      }
      if (!measurements) {
        throw new Error('measurements not found');
      }

      expect(trackEvent.calledOnce).toBe(true);
      expect(name).toBe(`${appName}/test`);
      expect(properties['common.source']).toBe(appName);
      expect(properties['common.os']).not.toHaveLength(0);
      expect(properties['common.platformversion']).not.toHaveLength(0);
      expect(properties['common.arch']).not.toHaveLength(0);
      expect(properties['appmap.cli.version']).toBe(version);
      expect(properties['appmap.cli.machineId']).toBe(Telemetry.machineId);
      expect(properties['appmap.cli.sessionId']).toBe(Telemetry.session.id);
      expect(typeof properties['appmap.cli.args']).toBe('string');
      expect(properties['appmap.cli.prop']).toBe('value');
      expect(measurements['appmap.cli.metric']).toBe(1);
    });

    it('does not send undefined properties', () => {
      const trackEvent = Telemetry.client.trackEvent as sinon.SinonStub;
      Telemetry.sendEvent({
        name: 'test',
        properties: { prop: undefined },
        metrics: { metric: undefined },
      });

      const [[{ properties, measurements }]] = trackEvent.args;

      if (!properties) {
        throw new Error('properties not found');
      }
      if (!measurements) {
        throw new Error('measurements not found');
      }

      expect(properties).not.toHaveProperty('appmap.cli.prop');
      expect(properties).not.toHaveProperty('appmap.cli.metric');
    });
  });
});
