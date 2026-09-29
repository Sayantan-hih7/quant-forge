import type { AxiosInstance } from 'axios';
import { accepted, configureBroadcastLimit, classifyLogin, totp, type BroadcastLimitClient } from './motilal-auth.js';
import { parseTick } from './motilal-packets.js';
import { AppError, invariant } from '../../../shared/errors.js';
import type { ChildCommand, ChildEvent, FeedInstrument } from '../types/feed.types.js';

interface BroadcastSdk extends BroadcastLimitClient {
  requestInstance: AxiosInstance;
  GetAccessToken(): Promise<unknown>; setAccessToken(value: string): Promise<unknown>;
  SystemInfo(): Promise<{ model?: string; manufacturer?: string }>;
  setdeviceModel(value: string): unknown; setManufacture(value: string): unknown;
  GetPublicIP(): Promise<string>; setClientPublicIp(value: string): string;
  GetLocationInfo(value: string): Promise<unknown>; setLocationInfo(value: unknown): unknown;
  Login(user: string, password: string, twoFactor: string, vendor: string, otp: string): Promise<unknown>;
  verifyotp(value: string): Promise<unknown>; GetMaxBroadcastLimit(user: string): Promise<unknown>;
  Broadcast_connect(): Promise<void>; Register(exchange: string, segment: string, code: number): void;
  UnRegister(exchange: string, segment: string, code: number): void;
  l_scrip_code: number[];
  onBroadcast(event: 'tick', handler: (packet: Record<string, unknown>) => void): void;
}
type SdkConstructor = new (key: string, url: string, source: string, browser: string, version: string, secret: string) => BroadcastSdk;
const send = (event: ChildEvent) => { if (process.connected) process.send?.(event, () => {}); };
let started = false, otpResolve: ((otp: string) => void) | undefined;
let stage = 'SDK initialization';
let replace: ((stocks: FeedInstrument[]) => void) | undefined;
let pending: FeedInstrument[] | undefined;
let timer: NodeJS.Timeout | undefined;
function fail(message: string) { send({ type: 'status', state: 'error', message }); process.exit(1); }
function deadline(ms: number) { clearTimeout(timer); timer = setTimeout(() => fail('Motilal connection timed out. Reconnect and complete authentication.'), ms); }

// The isolated SDK may log authorization headers. Its output is never forwarded to the API process.
console.log = console.error = console.warn = (...args: unknown[]) => {
  if (stage !== 'broadcast connection') return;
  if (args.some(value => typeof value === 'string' && /FAILED|not Authorized|Authorization is InValid/i.test(value))) fail('Motilal rejected the broadcast authentication. Check broker access and reconnect.');
  if (args.some(value => typeof value === 'string' && /Broadcast Socket closed|Broadcast Error::/.test(value))) fail('Motilal stream disconnected. Reconnect before using live prices.');
};
process.on('uncaughtException', () => fail('Motilal SDK stopped unexpectedly. Reconnect the data feed.'));
process.on('unhandledRejection', () => fail('Motilal connection failed. Check broker access and reconnect.'));
process.on('disconnect', () => process.exit(0));
process.on('message', (command: ChildCommand) => {
  if (command.type === 'stop') process.exit(0);
  if (command.type === 'replace') { pending = command.instruments; replace?.(command.instruments); }
  if (command.type === 'otp') { otpResolve?.(command.value); otpResolve = undefined; }
  if (command.type === 'start' && !started) { started = true; void start(command.instruments).catch(error => fail(`Motilal ${stage} failed. ${error instanceof AppError ? error.message : 'Check broker access and reconnect.'}`)); }
});

async function start(instruments: FeedInstrument[]) {
  deadline(60000);
  // Vendor code is the only CommonJS dependency; all application modules use TypeScript ESM.
  const sdkPath = new URL('../../../../vendor/motilal-broadcast-sdk/MOFSLOPENAPI_V3.1.cjs', import.meta.url).href;
  const Sdk = (await import(sdkPath)).default as SdkConstructor;
  const sdk = new Sdk(process.env.MO_API_KEY!, process.env.MO_ENV === 'uat' ? 'https://openapi.motilaloswaluat.com' : 'https://openapi.motilaloswal.com', 'WEB', 'Chrome', '125', process.env.MO_API_SECRET_KEY!);
  stage = 'device initialization';
  const system = await sdk.SystemInfo();
  const deviceModel = process.env.MO_DEVICE_MODEL || system.model;
  const manufacturer = process.env.MO_MANUFACTURER || system.manufacturer;
  invariant(deviceModel && manufacturer, 'System hardware metadata is unavailable. Configure MO_DEVICE_MODEL and MO_MANUFACTURER for this host.');
  await sdk.setdeviceModel(deviceModel); await sdk.setManufacture(manufacturer);
  stage = 'public IP lookup';
  const ip = await sdk.GetPublicIP();
  stage = 'location initialization';
  await sdk.setLocationInfo(await sdk.GetLocationInfo(await sdk.setClientPublicIp(ip)));
  const user = process.env.MO_CLIENT_CODE!.trim().toUpperCase();
  stage = 'login';
  const verified = classifyLogin(await sdk.Login(user, process.env.MO_PASSWORD!, process.env.MO_2FA!, process.env.MO_VENDOR_INFO || user, process.env.MO_TOTP_SECRET ? totp(process.env.MO_TOTP_SECRET) : ''));
  if (!verified) {
    deadline(120000); send({ type: 'status', state: 'otp-required', message: 'Motilal requires the OTP sent to your registered mobile/email.' });
    const otp = await new Promise<string>(resolve => { otpResolve = resolve; });
    stage = 'OTP verification'; accepted(await sdk.verifyotp(otp)); deadline(30000);
  }
  stage = 'access-token generation';
  const access = accepted(await sdk.GetAccessToken());
  invariant(typeof access.accesstoken === 'string' && access.accesstoken.length > 0, 'Motilal did not issue a data API access token');
  await sdk.setAccessToken(access.accesstoken);
  stage = 'subscription limit check';
  // SDK 3.1 discards this method's HTTP return value. Observe only the public
  // limit response through Axios; never forward its request headers or tokens.
  let observedLimit: unknown;
  const observer = sdk.requestInstance.interceptors.response.use(response => {
    // The vendor's earlier interceptor has already unwrapped response.data.
    observedLimit = response;
    return response;
  });
  let returnedLimit: unknown;
  // Retail login identifies the account; supplying clientcode is rejected with MO2031.
  try { returnedLimit = await sdk.GetMaxBroadcastLimit(''); }
  finally { sdk.requestInstance.interceptors.response.eject(observer); }
  const limit = await configureBroadcastLimit(sdk, returnedLimit ?? observedLimit, 1);
  send({ type: 'status', state: 'connecting', message: 'Motilal login verified. Connecting live prices.', limit });
  const lookup = new Map<string, FeedInstrument>();
  const details = new Map<string, { day: string; values: { open: number | null; high: number | null; low: number | null; previousClose: number | null } }>();
  const last = new Map<string, string>();
  sdk.onBroadcast('tick', packet => {
    const exchange = ['N', 'NSE', 'NSECASH'].includes(String(packet.Exchange)) ? 'NSE' : 'BSE';
    const stock = lookup.get(`${exchange}:${packet['Scrip Code'] ?? packet.ScripCode ?? packet.scripcode}`);
    if (!stock) return;
    const day = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
    if (packet.Type === 'DayOHLC') {
      const price = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; };
      details.set(stock.id, { day, values: { open: price(packet.Open), high: price(packet.High), low: price(packet.Low), previousClose: price(packet.PrevDayClose) } });
      return;
    }
    const quote = parseTick(packet, stock);
    if (!quote || (last.get(stock.id) ?? '') > quote.at) return;
    const values = details.get(stock.id);
    const quoteDay = new Date(Date.parse(quote.at) + 19800000).toISOString().slice(0, 10);
    if (values?.day === quoteDay) quote.details = values.values;
    const average = Number(packet.LTP_AvgTradePrice);
    if (Number.isFinite(average) && average > 0) quote.details = { ...quote.details, averagePrice: average };
    last.set(stock.id, quote.at); send({ type: 'tick', quote });
  });
  stage = 'broadcast connection';
  await sdk.Broadcast_connect();
  replace = stocks => {
    const selected = stocks.slice(0, limit);
    const next = new Map(selected.map(s => [`${s.exchange}:${s.code}`, s]));
    for (const [key, stock] of lookup) if (!next.has(key)) { sdk.UnRegister(stock.exchange, 'CASH', stock.code!); lookup.delete(key); last.delete(stock.id); details.delete(stock.id); }
    for (const [key, stock] of next) if (!lookup.has(key)) {
      invariant(stock.code !== undefined, 'Motilal stock mapping missing'); lookup.set(key, stock); sdk.Register(stock.exchange, 'CASH', stock.code);
    }
    sdk.l_scrip_code = [...new Set(selected.map(s => s.code!))];
  };
  replace(pending ?? instruments);
  clearTimeout(timer);
  send({ type: 'status', state: 'waiting', message: 'Authenticated and subscribed. Waiting for timestamped market ticks.', limit });
}
