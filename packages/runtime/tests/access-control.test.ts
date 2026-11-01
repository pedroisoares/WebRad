import { JSDOM } from 'jsdom';
import { createPage } from '@webrad/project-model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Access,
  WebAccessControl,
  WebPage,
  WebPageRouter,
  evaluateAccess,
  type RuntimePageRoute,
} from '../src/index.js';

afterEach(() => {
  Access.configure({ loginPage: '', deniedPage: '', persist: 'none' });
  Access.clear();
  vi.unstubAllGlobals();
});

function createDom(url: string): JSDOM {
  const dom = new JSDOM('<base href="/">', { url });
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  return dom;
}

function route(name: string, path: string, allowedRoles: readonly string[] = []): RuntimePageRoute {
  const page = createPage(name);
  const model = {
    ...page,
    components: page.components.map((component) =>
      component.id === page.rootComponentId
        ? { ...component, props: { ...component.props, allowedRoles } }
        : component,
    ),
  };
  return { id: model.id, name, path, model, createPage: (element) => new WebPage(element) };
}

describe('evaluateAccess', () => {
  it('treats empty lists as public, * as signed in and otherwise any matching role', () => {
    const tecnico = { roles: ['TECNICO'] };
    expect(evaluateAccess(null, [])).toEqual({ allowed: true });
    expect(evaluateAccess(null, ['*'])).toEqual({ allowed: false, reason: 'unauthenticated' });
    expect(evaluateAccess(tecnico, ['*'])).toEqual({ allowed: true });
    expect(evaluateAccess(tecnico, ['ADMIN', 'TECNICO'])).toEqual({ allowed: true });
    expect(evaluateAccess(tecnico, [' ADMIN '])).toEqual({ allowed: false, reason: 'forbidden' });
  });
});

describe('WebAccessControl', () => {
  it('signs users in and out, checks roles and notifies listeners', () => {
    const access = new WebAccessControl();
    access.configure({ persist: 'none' });
    const listener = vi.fn();
    const unsubscribe = access.onChange(listener);
    access.setUser({ id: '7', name: 'Ana', roles: ['TECNICO', 'TECNICO', ' GESTOR '] });
    expect(access.roles).toEqual(['TECNICO', 'GESTOR']);
    expect(access.hasRole('ADMIN', 'GESTOR')).toBe(true);
    expect(access.hasAllRoles('ADMIN', 'GESTOR')).toBe(false);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana' }));
    unsubscribe();
    access.clear();
    expect(access.isAuthenticated).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('persists the user in session storage and restores it', () => {
    const dom = createDom('https://sigat.example/');
    vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
    const first = new WebAccessControl();
    first.setUser({ name: 'Ana', roles: ['ADMIN'] });
    expect(dom.window.sessionStorage.getItem('webrad.access.user')).toContain('ADMIN');
    const second = new WebAccessControl();
    expect(second.hasRole('ADMIN')).toBe(true);
    second.clear();
    expect(dom.window.sessionStorage.getItem('webrad.access.user')).toBeNull();
    dom.window.close();
  });

  it('hides restricted elements until the user has a role, without touching Visible', () => {
    const dom = createDom('https://sigat.example/');
    const access = new WebAccessControl();
    access.configure({ persist: 'none' });
    const button = dom.window.document.createElement('button');
    access.restrict(button, ['ADMIN']);
    expect(button.dataset.webradAccessDenied).toBe('true');
    expect(button.hasAttribute('inert')).toBe(true);
    expect(button.style.display).toBe('');
    access.setUser({ roles: ['ADMIN'] });
    expect(button.hasAttribute('data-webrad-access-denied')).toBe(false);
    access.setUser({ roles: ['TECNICO'] });
    expect(button.dataset.webradAccessDenied).toBe('true');
    access.restrict(button, []);
    expect(button.hasAttribute('data-webrad-access-denied')).toBe(false);
    expect(access.restrictionOf(button)).toEqual([]);
    dom.window.close();
  });
});

describe('protected page routes', () => {
  function app(): RuntimePageRoute[] {
    return [
      route('PageHome', '/home'),
      route('PageLogin', '/login'),
      route('PageDenied', '/403', ['*']),
      route('PageChamados', '/chamados', ['*']),
      route('PageUsuarios', '/admin/usuarios', ['ADMIN']),
    ];
  }

  it('sends signed-out users to /login and records the refused page', () => {
    Access.configure({ persist: 'none' });
    const dom = createDom('https://sigat.example/chamados');
    const denied = vi.fn();
    dom.window.addEventListener('webrad:access-denied', denied);
    const router = new WebPageRouter(app(), dom.window.document.body);
    router.start('PageHome');
    expect(router.activeRoute?.name).toBe('PageLogin');
    expect(dom.window.location.pathname).toBe('/login');
    expect(Access.lastDenied).toEqual({ page: 'PageChamados', reason: 'unauthenticated' });
    expect(denied).toHaveBeenCalledOnce();
    Access.setUser({ name: 'Ana', roles: ['TECNICO'] });
    router.navigateBrowser('PageChamados');
    expect(router.activeRoute?.name).toBe('PageChamados');
    router.dispose();
    dom.window.close();
  });

  it('sends users without the role to the 403 page and signs out to login', () => {
    Access.configure({ persist: 'none' });
    Access.setUser({ name: 'Ana', roles: ['TECNICO'] });
    const dom = createDom('https://sigat.example/home');
    const router = new WebPageRouter(app(), dom.window.document.body);
    router.start('PageHome');
    router.navigateBrowser('PageUsuarios');
    expect(router.activeRoute?.name).toBe('PageDenied');
    expect(dom.window.location.pathname).toBe('/403');
    router.navigateBrowser('PageChamados');
    Access.clear();
    expect(router.activeRoute?.name).toBe('PageLogin');
    router.dispose();
    dom.window.close();
  });

  it('uses configured pages and refuses when no allowed fallback exists', () => {
    Access.configure({ persist: 'none', loginPage: 'PageHome' });
    const dom = createDom('https://sigat.example/home');
    const router = new WebPageRouter(app(), dom.window.document.body);
    router.start('PageHome');
    router.navigateBrowser('PageUsuarios');
    expect(router.activeRoute?.name).toBe('PageHome');
    router.dispose();
    dom.window.close();
    const lockedDom = createDom('https://sigat.example/a');
    const locked = new WebPageRouter(
      [route('PageA', '/a', ['ADMIN']), route('PageB', '/b', ['ADMIN'])],
      lockedDom.window.document.body,
    );
    expect(() => locked.start('PageA')).toThrow(/no allowed login or 403 page/u);
    locked.dispose();
    lockedDom.window.close();
  });
});
