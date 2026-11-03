import type { RestGoPublishedApi } from '@webrad/designer';
import type {
  RestGoAdminCatalog,
  RestGoAdminEndpoint,
  RestGoAdminPublication,
} from '../../../shared/restgo-admin';

export interface RestGoEndpointGroup {
  readonly key: string;
  readonly slug: string;
  readonly version: number;
  readonly endpoints: readonly RestGoAdminEndpoint[];
}

export function restGoEndpointGroups(
  endpoints: readonly RestGoAdminEndpoint[],
): readonly RestGoEndpointGroup[] {
  const groups = new Map<string, RestGoAdminEndpoint[]>();
  for (const endpoint of endpoints) {
    const key = JSON.stringify([endpoint.slug, endpoint.versao]);
    const group = groups.get(key) ?? [];
    group.push(endpoint);
    groups.set(key, group);
  }
  return [...groups]
    .map(([key, entries]) => ({
      key,
      slug: entries[0]!.slug,
      version: entries[0]!.versao,
      endpoints: entries,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug) || right.version - left.version);
}

export function restGoPublicationEndpoints(
  catalog: RestGoAdminCatalog,
  publication: RestGoAdminPublication,
): readonly RestGoAdminEndpoint[] {
  if (publication.idendpoint === null) return [];
  const anchor = catalog.endpoints.find((endpoint) => endpoint.id === publication.idendpoint);
  const slug = publication.endpointSlug || anchor?.slug;
  const version = publication.versao || anchor?.versao;
  return catalog.endpoints.filter(
    (endpoint) => endpoint.slug === slug && endpoint.versao === version,
  );
}

type PublishedParameterType = NonNullable<
  NonNullable<RestGoPublishedApi['parameters']>[number]['type']
>;

const HEXAPI_PARAMETER_TYPES: Readonly<Record<string, PublishedParameterType>> = {
  int: 'numeric',
  number: 'numeric',
  bool: 'boolean',
  date: 'data',
  datetime: 'data',
};

/** Reads a HexAPI parameter list such as "id_chamado:int, texto:html, servicos:json?". */
export function hexApiParameters(
  spec: string | undefined,
): readonly { readonly name: string; readonly type: PublishedParameterType }[] {
  return (spec ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const [rawName = '', rawType = 'string'] = part.split(':', 2);
      const name = rawName.trim().replace(/\?$/u, '');
      const type = rawType.trim().replace(/\?$/u, '').toLowerCase();
      return { name, type: HEXAPI_PARAMETER_TYPES[type] ?? 'string' };
    })
    .filter((parameter) => parameter.name.length > 0);
}

export function restGoPublicationAuthentication(
  publication: RestGoAdminPublication,
): RestGoPublishedApi['authentication'] {
  return publication.requiresAuthentication ? 'jwt' : publication.isPublic ? 'public' : 'api-token';
}

export function restGoCatalogToPublishedApis(
  catalog: RestGoAdminCatalog,
): readonly RestGoPublishedApi[] {
  return catalog.publications.flatMap((publication) => {
    const database = catalog.bancos.find((entry) => entry.id === publication.idbanco);
    if (!publication.ativo || !database?.ativo) return [];
    return restGoPublicationEndpoints(catalog, publication).flatMap((endpoint) => {
      const operation =
        endpoint.tipo === 'operation'
          ? catalog.operations.find((entry) => entry.id === endpoint.idoperacao)
          : undefined;
      if (!endpoint.ativo || (endpoint.tipo === 'operation' && !operation?.ativo)) return [];
      return [
        {
          id: `${String(publication.id)}:${String(endpoint.id)}`,
          name: endpoint.slug,
          database: database.slug,
          endpoint: endpoint.slug,
          method: endpoint.metodo,
          apiVersion: endpoint.versao,
          authentication: restGoPublicationAuthentication(publication),
          kind: endpoint.tipo === 'normal' ? ('sql' as const) : ('operation' as const),
          ...(endpoint.tipo === 'normal' ? { script: endpoint.script } : {}),
          ...(endpoint.tipo === 'composto'
            ? { parameters: hexApiParameters(endpoint.parametros) }
            : {}),
          ...(operation
            ? {
                parameters: operation.parametrosEntrada.map((parameter) => ({
                  name: parameter.nome,
                  type: parameter.tipo || ('string' as const),
                })),
              }
            : {}),
        },
      ];
    });
  });
}

export function restGoErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'The RestGO operation could not be completed.';
  const message = error.message;
  const prefix = "Error invoking remote method 'webrad:restgo-admin:";
  const separator = "': Error: ";
  const start = message.startsWith(prefix) ? message.indexOf(separator, prefix.length) : -1;
  return start >= 0 ? message.slice(start + separator.length) : message;
}
