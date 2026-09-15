import {
  TYPE,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';

export function messageLeaves(
  value: unknown,
  path = '',
): Record<string, string> {
  if (typeof value === 'string') return { [path]: value };
  if (!value || typeof value !== 'object') {
    throw new Error(
      `Expected a message string or namespace at ${path || '<root>'}`,
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`Empty namespace at ${path || '<root>'}`);
  }

  // Legal sections use t.raw arrays, so indexed entries are message leaves too.
  return Object.fromEntries(
    entries.flatMap(([key, child]) =>
      Object.entries(messageLeaves(child, path ? `${path}.${key}` : key)),
    ),
  );
}

export function templateVariables(message: string): string[] {
  // Keep this syntax identical to substituteVars: whitespace is not accepted.
  return [...message.matchAll(/\{\{(\w+)\}\}/g)]
    .map((match) => match[1])
    .sort();
}

export function hasMalformedTemplateVariables(message: string): boolean {
  const withoutValidVariables = message.replace(
    /(?<!\{)\{\{\w+\}\}(?!\})/g,
    '',
  );
  return (
    withoutValidVariables.includes('{{') ||
    withoutValidVariables.includes('}}')
  );
}

export function unexpectedTemplateVariables(
  message: string,
  allowed: readonly string[],
): string[] {
  return templateVariables(message).filter((name) => !allowed.includes(name));
}

/**
 * Canonical ICU structure that ignores translated prose and ordering while
 * retaining every formatted value, rich-text tag, selector, and branch path.
 */
export function icuBranchStructure(
  elements: MessageFormatElement[],
): string[] {
  const structure: string[] = [];

  function visit(nodes: MessageFormatElement[], path: string): void {
    for (const element of nodes) {
      switch (element.type) {
        case TYPE.literal:
          break;
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          structure.push(`${path}|${TYPE[element.type]}:${element.value}`);
          break;
        case TYPE.pound:
          structure.push(`${path}|pound`);
          break;
        case TYPE.tag: {
          const tagPath = `${path}>tag:${element.value}`;
          structure.push(`${path}|tag:${element.value}`);
          visit(element.children, tagPath);
          break;
        }
        case TYPE.select:
        case TYPE.plural: {
          const kind = TYPE[element.type];
          const optionKeys = Object.keys(element.options).sort();
          const settings =
            element.type === TYPE.plural
              ? `:${element.pluralType}:offset=${element.offset}`
              : '';
          structure.push(
            `${path}|${kind}:${element.value}${settings}[${optionKeys.join(',')}]`,
          );
          for (const optionKey of optionKeys) {
            visit(
              element.options[optionKey].value,
              `${path}>${kind}:${element.value}.${optionKey}`,
            );
          }
          break;
        }
      }
    }
  }

  visit(elements, 'root');
  return structure.sort();
}
