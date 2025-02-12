import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { type IMinimatch, Minimatch } from 'minimatch';

export default class ContentRestrictions {
  localRequired = false;
  #global?: IMinimatch[];
  #local = new Map<string, IMinimatch[]>();

  constructor() {
    this.loadDefaults();
  }

  public setGlobalRestrictions(restrictions: string[]) {
    this.#global = restrictions.map(makePattern);
  }

  public setLocalRestrictions(root: string, restrictions: string[]) {
    this.#local.set(normalizeAbsolute(root), restrictions.map(makePattern));
  }

  public safeRestricted(root: string, path: string): boolean;
  public safeRestricted(absolutePath: string): boolean;
  public safeRestricted(rootOrAbsolute: string, relative?: string): boolean {
    try {
      return this.isRestricted(rootOrAbsolute, relative);
    } catch (e) {
      console.error(e);
      return true;
    }
  }

  public isRestricted(root: string, path: string): boolean;
  public isRestricted(absolutePath: string): boolean;
  public isRestricted(rootOrAbsolute: string, relative?: string): boolean;

  public isRestricted(rootOrAbsolute: string, relative?: string): boolean {
    const normalized = normalizeAbsolute(rootOrAbsolute);
    if (relative) return this.isRestrictedImpl(normalized, relative);
    else {
      const root = [...this.#local.keys()].find((r) => normalized.startsWith(r));
      if (root) return this.isRestrictedImpl(root, normalized.slice(root.length + 1));
      else if (this.localRequired) throw new Error(`No local restrictions for path ${normalized}`);
      else return this.isRestrictedImpl('', normalized);
    }
  }

  private isRestrictedImpl(root: string, path: string): boolean {
    let normalized = path.replaceAll('\\', '/');
    if (normalized.startsWith('/')) normalized = normalized.slice(1);

    if (this.#global) {
      for (const matcher of this.#global) {
        if (matcher.match(normalized)) return true;
      }
    }

    const localRestrictions = this.#local.get(root);
    if (localRestrictions) {
      for (const matcher of localRestrictions) {
        if (matcher.match(normalized)) return true;
      }
    } else if (this.localRequired) throw new Error(`No local restrictions for root ${root}`);

    return false;
  }

  reset() {
    this.#global = undefined;
    this.#local.clear();
  }

  loadDefaults() {
    this.setGlobalRestrictions(getDefaultPatterns());
  }

  static get instance(): ContentRestrictions {
    if (!this.#instance) this.#instance = new ContentRestrictions();
    return this.#instance;
  }

  static #instance: ContentRestrictions;
}

function makePattern(pattern: string): IMinimatch {
  let pat = pattern;

  // patterns starting with a slash are relative to the project root
  if (pat.startsWith('/')) pat = pat.slice(1);
  // others can be anywhere
  else pat = '**/' + pat;

  return new Minimatch(pat, { dot: true, matchBase: true });
}

function normalizeAbsolute(path: string): string {
  let normalized = path;
  // lower case the first character so windows drives are all lower case
  if (normalized[0] >= 'A' && normalized[0] <= 'Z')
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  return normalized.replaceAll('\\', '/');
}

/*
 * tries to read the global patterns from a
 * config file or fall back to hardcoded list
 */
function getDefaultPatterns(): string[] {
  // TODO: is there a better place to put this code?
  const configPath = join(homedir(), '.appmap', 'navie', 'global-ignore');
  try {
    return readFileSync(configPath, 'utf-8')
      .split('\n')
      .map((s) => s.trim());
  } catch (e) {
    console.warn(`Using default content restriction list, you can override it in ${configPath}`);
    return DEFAULT_PATTERNS;
  }
}

const DEFAULT_PATTERNS = [
  'config*.json', // JSON configuration files often contain sensitive settings and credentials
  '*.pem', // PEM files typically store private keys and certificates
  '*.key', // Key files contain private keys
  '*.crt', // Certificate files
  '*.log', // Log files may contain sensitive information such as error messages and stack traces
  '*.env', // Environment variable files often contain sensitive data like API keys and passwords
  '**/src/main/resources/*.properties', // Properties files in resources may contain configuration settings
  '**/src/main/resources/*.yaml', // YAML files in resources may contain configuration settings
  '**/src/main/resources/*.yml', // YML files in resources may contain configuration settings
  '**/src/main/resources/*.json', // JSON files in resources may contain configuration settings
  '**/src/main/resources/*.xml', // XML files in resources may contain configuration settings
];
