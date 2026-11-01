/**
 * Client-side access rules: who is signed in, which roles they have, which
 * components they may see and which pages they may open. These rules shape the
 * interface only; the API must still authorize every request on the server.
 */

export interface AccessUser {
  readonly id?: string;
  readonly name?: string;
  /** Profiles or groups such as "ADMIN", "TECNICO", "SOLICITANTE". */
  readonly roles: readonly string[];
  /** Extra application data, such as a department. */
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface AccessConfiguration {
  /** Page name, ID or path opened when a protected page needs a signed-in user. */
  readonly loginPage?: string;
  /** Page name, ID or path opened when the signed-in user lacks the roles. */
  readonly deniedPage?: string;
  /** Where the user survives a reload: 'session' (tab), 'local', or 'none'. */
  readonly persist?: 'session' | 'local' | 'none';
  readonly storageKey?: string;
}

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'unauthenticated' | 'forbidden' };

/** Any signed-in user; use in Allowed Roles to require only a login. */
export const ACCESS_ANY_AUTHENTICATED = '*';

const DEFAULT_STORAGE_KEY = 'webrad.access.user';

function normalizeRoles(roles: readonly unknown[]): readonly string[] {
  const unique = new Set<string>();
  for (const role of roles) {
    if (typeof role !== 'string') continue;
    const trimmed = role.trim();
    if (trimmed.length > 0) unique.add(trimmed);
  }
  return Object.freeze([...unique]);
}

function normalizeUser(value: unknown): AccessUser | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Readonly<Record<string, unknown>>;
  const roles = Array.isArray(source.roles) ? normalizeRoles(source.roles) : [];
  const data =
    typeof source.data === 'object' && source.data !== null && !Array.isArray(source.data)
      ? (source.data as Readonly<Record<string, unknown>>)
      : undefined;
  return Object.freeze({
    ...(typeof source.id === 'string' || typeof source.id === 'number'
      ? { id: String(source.id) }
      : {}),
    ...(typeof source.name === 'string' ? { name: source.name } : {}),
    roles,
    ...(data === undefined ? {} : { data }),
  });
}

/** Decides access for a list of allowed roles; an empty list is public. */
export function evaluateAccess(
  user: AccessUser | null,
  allowedRoles: readonly string[],
): AccessDecision {
  const required = normalizeRoles(allowedRoles);
  if (required.length === 0) return { allowed: true };
  if (user === null) return { allowed: false, reason: 'unauthenticated' };
  if (required.includes(ACCESS_ANY_AUTHENTICATED)) return { allowed: true };
  return required.some((role) => user.roles.includes(role))
    ? { allowed: true }
    : { allowed: false, reason: 'forbidden' };
}

function storage(kind: 'session' | 'local' | 'none'): Storage | null {
  if (kind === 'none') return null;
  try {
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export class WebAccessControl {
  #user: AccessUser | null = null;
  #configuration: Required<Omit<AccessConfiguration, 'loginPage' | 'deniedPage'>> &
    Pick<AccessConfiguration, 'loginPage' | 'deniedPage'> = {
    persist: 'session',
    storageKey: DEFAULT_STORAGE_KEY,
  };
  readonly #listeners = new Set<(user: AccessUser | null) => void>();
  readonly #elements = new Set<WeakRef<HTMLElement>>();
  readonly #elementRoles = new WeakMap<HTMLElement, readonly string[]>();
  #restored = false;
  #lastDenied: { readonly page: string; readonly reason: 'unauthenticated' | 'forbidden' } | null =
    null;

  /**
   * The last page the router refused and why, so a login page can return the
   * user there after signing in. Cleared by setUser.
   */
  public get lastDenied(): {
    readonly page: string;
    readonly reason: 'unauthenticated' | 'forbidden';
  } | null {
    return this.#lastDenied;
  }

  /** Router hook; records a refused page. */
  public recordDenied(page: string, reason: 'unauthenticated' | 'forbidden'): void {
    this.#lastDenied = { page, reason };
  }

  /** The signed-in user, or null. */
  public get user(): AccessUser | null {
    this.#restore();
    return this.#user;
  }

  public get roles(): readonly string[] {
    return this.user?.roles ?? [];
  }

  public get isAuthenticated(): boolean {
    return this.user !== null;
  }

  public get configuration(): AccessConfiguration {
    return { ...this.#configuration };
  }

  /** Changes redirect pages and persistence; existing users move to the new storage. */
  public configure(configuration: AccessConfiguration): void {
    const user = this.user;
    storage(this.#configuration.persist)?.removeItem(this.#configuration.storageKey);
    this.#configuration = {
      ...this.#configuration,
      ...Object.fromEntries(
        Object.entries(configuration).filter(([, value]) => value !== undefined),
      ),
    };
    this.#save(user);
  }

  /** Signs a user in for interface rules, usually after the login API succeeds. */
  public setUser(user: AccessUser | null): void {
    this.#restored = true;
    this.#lastDenied = null;
    this.#user = normalizeUser(user);
    this.#save(this.#user);
    this.#refreshElements();
    for (const listener of [...this.#listeners]) listener(this.#user);
  }

  /** Signs the user out of the interface rules. */
  public clear(): void {
    this.setUser(null);
  }

  /** True when the user has at least one of the roles. */
  public hasRole(...roles: readonly string[]): boolean {
    const user = this.user;
    return user !== null && roles.some((role) => user.roles.includes(role.trim()));
  }

  /** True when the user has every one of the roles. */
  public hasAllRoles(...roles: readonly string[]): boolean {
    const user = this.user;
    return user !== null && roles.every((role) => user.roles.includes(role.trim()));
  }

  /** Applies Allowed Roles semantics: empty is public and "*" is any signed-in user. */
  public isAllowed(allowedRoles: readonly string[]): boolean {
    return evaluateAccess(this.user, allowedRoles).allowed;
  }

  public evaluate(allowedRoles: readonly string[]): AccessDecision {
    return evaluateAccess(this.user, allowedRoles);
  }

  /** Calls the listener after each sign-in or sign-out; returns an unsubscribe function. */
  public onChange(listener: (user: AccessUser | null) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Hides an element unless the user has one of the roles. The rule is kept
   * separate from the component's Visible property and follows sign-in changes.
   */
  public restrict(element: HTMLElement, allowedRoles: readonly string[]): void {
    const roles = normalizeRoles(allowedRoles);
    if (roles.length === 0) {
      if (this.#elementRoles.has(element)) {
        this.#elementRoles.delete(element);
        this.#apply(element, true);
      }
      return;
    }
    if (!this.#elementRoles.has(element)) this.#elements.add(new WeakRef(element));
    this.#elementRoles.set(element, roles);
    this.#apply(element, this.isAllowed(roles));
  }

  /** Roles required by an element, or an empty list. */
  public restrictionOf(element: HTMLElement): readonly string[] {
    return this.#elementRoles.get(element) ?? [];
  }

  #apply(element: HTMLElement, allowed: boolean): void {
    if (allowed) {
      element.removeAttribute('data-webrad-access-denied');
      element.removeAttribute('inert');
      return;
    }
    element.setAttribute('data-webrad-access-denied', 'true');
    // inert keeps hidden controls out of focus order and assistive technology.
    element.setAttribute('inert', '');
  }

  #refreshElements(): void {
    for (const reference of [...this.#elements]) {
      const element = reference.deref();
      const roles = element === undefined ? undefined : this.#elementRoles.get(element);
      if (element === undefined || roles === undefined) {
        this.#elements.delete(reference);
        continue;
      }
      this.#apply(element, this.isAllowed(roles));
    }
  }

  #restore(): void {
    if (this.#restored) return;
    this.#restored = true;
    try {
      const saved = storage(this.#configuration.persist)?.getItem(this.#configuration.storageKey);
      if (saved !== null && saved !== undefined) this.#user = normalizeUser(JSON.parse(saved));
    } catch {
      this.#user = null;
    }
  }

  #save(user: AccessUser | null): void {
    const target = storage(this.#configuration.persist);
    try {
      if (user === null) target?.removeItem(this.#configuration.storageKey);
      else target?.setItem(this.#configuration.storageKey, JSON.stringify(user));
    } catch {
      // Private browsing can refuse storage; the in-memory user still applies.
    }
  }
}

/** The application's shared access rules, available in page code as `Access`. */
export const Access = new WebAccessControl();
