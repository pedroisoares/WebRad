# Roles and protected pages

WebRAD can show components and open pages only for users with certain roles,
such as the SIGAT profiles `ADMIN`, `TECNICO`, and `SOLICITANTE`.

> These rules shape the interface only. Anyone can change browser code, so the
> API (HexAPI, RestGO, or another server) must still authorize every request.

## Signing the user in

After the login API succeeds, give the user and roles to `Access`:

```ts
protected async BTNEntrarClick(): Promise<void> {
  const session = await this.api.execute('login');
  Access.setUser({ id: session.id, name: session.nome, roles: session.perfis });
  Navigate(Access.lastDenied?.page ?? 'PageInicio');
}

protected BTNSairClick(): void {
  Access.clear();
  Navigate('PageLogin');
}
```

The user is kept in `sessionStorage` (per browser tab) so a reload keeps the
interface rules. `Access.configure({ persist: 'local' | 'none' })` changes that.

## Allowed Roles

Every visual component and every page has **Allowed Roles** in the Inspector's
Security section.

- Empty: public.
- `*`: any signed-in user.
- One or more roles: the user needs at least one of them.

A component whose roles the user lacks is hidden and made `inert`, so it cannot
be focused or used. This rule is separate from **Visible**: code that sets
`visible = true` does not reveal it. Rules follow `Access.setUser` and
`Access.clear` immediately. Code can also set `component.allowedRoles`.

## Protected pages

When the router opens a page whose roles the user lacks:

1. Signed-out users go to the login page: `Access.configure({ loginPage })`, or
   the page whose path is `/login`.
2. Signed-in users without the role go to the denied page:
   `Access.configure({ deniedPage })`, the page whose path is `/403`, or the
   login page.

The refused address is replaced in history, `Access.lastDenied` records the
page and reason, and the window receives a `webrad:access-denied` event. When
the user signs out while on a protected page, the router moves to the login
page. If no allowed login or denied page exists, navigation fails with an
error instead of showing the protected page. Give the login and `/403` pages
empty Allowed Roles (or `*` for `/403`).

## Checks in code

```ts
if (Access.hasRole('ADMIN', 'GESTOR')) this.BTNExcluir.enabled = true;
Access.onChange((user) => (this.LBLUsuario.caption = user?.name ?? ''));
```

`Access.user`, `Access.roles`, `Access.isAuthenticated`, `hasAllRoles`, and
`isAllowed(roles)` are also available.
