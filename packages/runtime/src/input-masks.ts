/**
 * Browser-safe masks, Brazilian document checks and date conversions shared by
 * WebEdit, the Designer and generated pages. Nothing here touches the DOM.
 */

export const WEB_EDIT_MASKS = [
  'none',
  'cpf',
  'cnpj',
  'cpf-cnpj',
  'phone',
  'cep',
  'custom',
] as const;
export type WebEditMask = (typeof WEB_EDIT_MASKS)[number];

const MASK_PATTERNS: Readonly<
  Record<Exclude<WebEditMask, 'none' | 'custom' | 'cpf-cnpj' | 'phone'>, string>
> = {
  cpf: '999.999.999-99',
  cnpj: '99.999.999/9999-99',
  cep: '99999-999',
};

export function isWebEditMask(value: unknown): value is WebEditMask {
  return typeof value === 'string' && (WEB_EDIT_MASKS as readonly string[]).includes(value);
}

/** True for masks whose characters are all digits, so mobile keyboards can be numeric. */
export function isNumericWebEditMask(mask: WebEditMask, pattern = ''): boolean {
  if (mask === 'none') return false;
  if (mask === 'custom') return pattern.length > 0 && !/[A*]/u.test(pattern);
  return true;
}

/**
 * Applies a pattern where `9` is a digit, `A` a letter, `*` a letter or digit
 * and anything else a literal. Characters that do not fit are dropped, and
 * literals are only written when another input character follows them.
 */
export function applyMaskPattern(value: string, pattern: string): string {
  const source = Array.from(value);
  let sourceIndex = 0;
  let output = '';
  for (const token of pattern) {
    if (sourceIndex >= source.length) break;
    const accepts =
      token === '9'
        ? (character: string) => /\p{Nd}/u.test(character)
        : token === 'A'
          ? (character: string) => /\p{L}/u.test(character)
          : token === '*'
            ? (character: string) => /[\p{L}\p{Nd}]/u.test(character)
            : undefined;
    if (accepts === undefined) {
      output += token;
      if (source[sourceIndex] === token) sourceIndex += 1;
      continue;
    }
    while (sourceIndex < source.length && !accepts(source[sourceIndex] ?? '')) sourceIndex += 1;
    const character = source[sourceIndex];
    if (character === undefined) break;
    output += token === 'A' ? character.toLocaleUpperCase() : character;
    sourceIndex += 1;
  }
  // Drop a dangling literal such as "123." when nothing follows it.
  return output.replace(/[^\p{L}\p{Nd}]+$/u, '');
}

export function onlyDigits(value: string): string {
  return value.replace(/\D+/gu, '');
}

/** Formats a value with one of the built-in masks or a custom pattern. */
export function formatWithWebEditMask(value: string, mask: WebEditMask, pattern = ''): string {
  switch (mask) {
    case 'none':
      return value;
    case 'custom':
      return pattern.length === 0 ? value : applyMaskPattern(value, pattern);
    case 'cpf-cnpj':
      return applyMaskPattern(
        value,
        onlyDigits(value).length > 11 ? MASK_PATTERNS.cnpj : MASK_PATTERNS.cpf,
      );
    case 'phone': {
      // (19) 3834-1234 for landlines and (19) 99876-5432 for mobiles.
      const digits = onlyDigits(value);
      return applyMaskPattern(digits, digits.length > 10 ? '(99) 99999-9999' : '(99) 9999-9999');
    }
    default:
      return applyMaskPattern(value, MASK_PATTERNS[mask]);
  }
}

/** Maximum length of a fully formatted value, used for the input's maxLength. */
export function webEditMaskMaxLength(mask: WebEditMask, pattern = ''): number | null {
  switch (mask) {
    case 'none':
      return null;
    case 'custom':
      return pattern.length === 0 ? null : Array.from(pattern).length;
    case 'cpf-cnpj':
      return MASK_PATTERNS.cnpj.length;
    case 'phone':
      return '(99) 99999-9999'.length;
    default:
      return MASK_PATTERNS[mask].length;
  }
}

function repeatedDigits(digits: string): boolean {
  return /^(\d)\1*$/u.test(digits);
}

/** Validates a CPF by its two check digits; punctuation is ignored. */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || repeatedDigits(digits)) return false;
  const numbers = Array.from(digits, Number);
  for (const length of [9, 10]) {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += (numbers[index] ?? 0) * (length + 1 - index);
    }
    const check = ((sum * 10) % 11) % 10;
    if (check !== numbers[length]) return false;
  }
  return true;
}

/** Validates a numeric CNPJ by its two check digits; punctuation is ignored. */
export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || repeatedDigits(digits)) return false;
  const numbers = Array.from(digits, Number);
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const length of [12, 13]) {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += (numbers[index] ?? 0) * (weights[index + 13 - length] ?? 0);
    }
    const remainder = sum % 11;
    const check = remainder < 2 ? 0 : 11 - remainder;
    if (check !== numbers[length]) return false;
  }
  return true;
}

/** Date-like WebEdit input types rendered by the browser's native picker. */
export const WEB_EDIT_DATE_INPUT_TYPES = ['date', 'datetime-local', 'time', 'month'] as const;
export type WebEditDateInputType = (typeof WEB_EDIT_DATE_INPUT_TYPES)[number];

export function isWebEditDateInputType(value: unknown): value is WebEditDateInputType {
  return (
    typeof value === 'string' && (WEB_EDIT_DATE_INPUT_TYPES as readonly string[]).includes(value)
  );
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

const BRAZILIAN_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/u;
const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/u;
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u;

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly hasTime: boolean;
}

function validParts(parts: DateParts): DateParts | null {
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return date.getFullYear() === parts.year &&
    date.getMonth() === parts.month - 1 &&
    date.getDate() === parts.day &&
    parts.hour < 24 &&
    parts.minute < 60 &&
    parts.second < 60
    ? parts
    : null;
}

function dateParts(value: string): DateParts | null {
  const text = value.trim();
  const brazilian = BRAZILIAN_DATE.exec(text);
  const iso = brazilian === null ? ISO_DATE.exec(text) : null;
  if (brazilian !== null) {
    const [, day, month, year, hour, minute, second] = brazilian;
    return validParts({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour ?? 0),
      minute: Number(minute ?? 0),
      second: Number(second ?? 0),
      hasTime: hour !== undefined,
    });
  }
  if (iso !== null) {
    const [, year, month, day, hour, minute, second] = iso;
    return validParts({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour ?? 0),
      minute: Number(minute ?? 0),
      second: Number(second ?? 0),
      hasTime: hour !== undefined,
    });
  }
  return null;
}

/**
 * Converts dd/mm/yyyy, ISO and MySQL `yyyy-mm-dd hh:mm:ss` text into the value
 * format a native input of `type` expects. Unrecognized text returns ''.
 */
export function toNativeDateInputValue(value: string, type: WebEditDateInputType): string {
  const text = value.trim();
  if (text.length === 0) return '';
  if (type === 'time') {
    const time = TIME.exec(text) ?? /[ T](\d{2}):(\d{2})(?::(\d{2}))?/u.exec(text);
    if (time === null) return '';
    const [, hour, minute, second] = time;
    if (Number(hour) > 23 || Number(minute) > 59) return '';
    return `${pad(Number(hour))}:${minute ?? '00'}${second !== undefined && second !== '00' ? `:${second}` : ''}`;
  }
  if (type === 'month') {
    const month = /^(\d{1,2})\/(\d{4})$/u.exec(text);
    if (month !== null) return `${month[2] ?? ''}-${pad(Number(month[1]))}`;
    if (/^\d{4}-\d{2}$/u.test(text)) return text;
  }
  const parts = dateParts(text);
  if (parts === null) return '';
  const date = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
  if (type === 'date') return date;
  if (type === 'month') return date.slice(0, 7);
  const seconds = parts.second === 0 ? '' : `:${pad(parts.second)}`;
  return `${date}T${pad(parts.hour)}:${pad(parts.minute)}${seconds}`;
}

/** Reads a native date input value as a local Date, or null when empty/invalid. */
export function nativeDateInputValueToDate(value: string, type: WebEditDateInputType): Date | null {
  if (value.length === 0) return null;
  if (type === 'time') {
    const time = TIME.exec(value);
    if (time === null) return null;
    const date = new Date(1970, 0, 1, Number(time[1]), Number(time[2]), Number(time[3] ?? 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parts = dateParts(type === 'month' ? `${value}-01` : value);
  return parts === null
    ? null
    : new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** Converts a local Date into the native value of a date-like input. */
export function dateToNativeDateInputValue(value: Date, type: WebEditDateInputType): string {
  if (Number.isNaN(value.getTime())) return '';
  const date = `${pad(value.getFullYear(), 4)}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  switch (type) {
    case 'date':
      return date;
    case 'month':
      return date.slice(0, 7);
    case 'time':
      return time;
    case 'datetime-local':
      return `${date}T${time}`;
  }
}

/** Formats a native date input value for display, e.g. 05/01/2024 14:30 in pt-BR. */
export function formatNativeDateInputValue(
  value: string,
  type: WebEditDateInputType,
  locale: string,
): string {
  const date = nativeDateInputValueToDate(value, type);
  if (date === null) return '';
  const options: Intl.DateTimeFormatOptions =
    type === 'date'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : type === 'month'
        ? { month: '2-digit', year: 'numeric' }
        : type === 'time'
          ? { hour: '2-digit', minute: '2-digit' }
          : {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            };
  return new Intl.DateTimeFormat(locale, options).format(date).replace(',', '');
}
