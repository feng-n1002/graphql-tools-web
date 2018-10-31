import {existsSync, readFileSync} from 'fs';
import {extname} from 'path';
import {parse, print} from 'graphql';
import * as graphqlImport from 'graphql-import';
import {GraphQLProjectConfig} from 'graphql-config/lib/GraphQLProjectConfig';

declare module 'graphql-config/lib/GraphQLProjectConfig' {
  interface GraphQLProjectConfig {
    resolvePathRelativeToConfig(relativePath: string): string;
    resolveProjectName(defaultName?: string): string;
    resolveSchemaPath(ignoreMissing?: boolean): string;
  }
}

export const defaultGraphQLProjectName = 'GraphQL';

function resolveProjectName(
  this: GraphQLProjectConfig,
  defaultName = defaultGraphQLProjectName,
) {
  return this.projectName || defaultName;
}

function resolveSchemaPath(this: GraphQLProjectConfig, ignoreMissing = false) {
  // schemaPath is nullable in graphq-config even though it cannot actually be
  // omitted. This function simplifies access ot the schemaPath without
  // requiring a type guard.
  if (!this.schemaPath) {
    // this case should never happen with a properly formatted config file.
    // graphql-config currently does not perform any validation so it's possible
    // for a mal-formed schema to be loaded at runtime.
    throw new Error(
      `Missing GraphQL schemaPath for project '${this.resolveProjectName()}'`,
    );
  }

  // resolve fully qualified schemaPath
  const schemaPath = this.resolveConfigPath(this.schemaPath);

  if (ignoreMissing) {
    return schemaPath;
  }

  if (!existsSync(schemaPath)) {
    const forProject = this.projectName
      ? ` for project '${this.projectName}'`
      : '';
    throw new Error(
      [
        `Schema not found${forProject}.`,
        `Expected to find the schema at '${schemaPath}' but the path does not exist.`,
        `Check '${
          this.configPath
        }' and verify that schemaPath is configured correctly${forProject}.`,
      ].join(' '),
    );
  }

  return schemaPath;
}

// temporary augmentation until `graphql-config` supports this new function
// see: https://github.com/prisma/graphql-config/pull/113
GraphQLProjectConfig.prototype.resolvePathRelativeToConfig =
  GraphQLProjectConfig.prototype.resolveConfigPath;

GraphQLProjectConfig.prototype.resolveProjectName = resolveProjectName;
GraphQLProjectConfig.prototype.resolveSchemaPath = resolveSchemaPath;

// temporary patch until graphql-import fixes schema definition imports
// see: https://github.com/prisma/graphql-import/issues/190
const importSchema = graphqlImport.importSchema;
export function importSchemaPatched(path: string, schemas?: any): string {
  const imported = importSchema(path, schemas);

  if (extname(path) === '.graphql') {
    // if we're importing an SDL schema file then check to see if we need to
    // inject a schema definition at the top
    const parsed = parse(readFileSync(path).toString());
    const definitions = parsed.definitions.filter(
      ({kind}) => kind === 'SchemaDefinition',
    );

    if (definitions.length) {
      return `${print({...parsed, definitions})} ${imported}`;
    }
  }

  return imported;
}
(graphqlImport as any).importSchema = importSchemaPatched;
