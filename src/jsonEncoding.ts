export interface EscapedDate {
  __typename: 'EscapedDate';
  isoString: string;
}

interface EscapedSet {
  __typename: 'EscapedSet';
  values: any[];
}

interface EscapedMap {
  __typename: 'EscapedMap>';
  values: Array<[any, any]>;
}

export type EscapedObject<T> = T extends Date
  ? EscapedDate
  : T extends Set<any>
  ? EscapedSet
  : T extends Map<any, any>
  ? EscapedMap
  : T extends Record<string, any>
  ? {
      [K in keyof T]: EscapedObject<T[K]>;
    }
  : T extends Array<infer E>
  ? Array<EscapedObject<E>>
  : T;

export type UnescapedObject<T> = T extends EscapedDate
  ? Date
  : T extends EscapedSet
  ? Set<any>
  : T extends EscapedMap
  ? Map<any, any>
  : T extends Record<string, any>
  ? {
      [K in keyof T]: UnescapedObject<T[K]>;
    }
  : T extends Array<infer E>
  ? Array<UnescapedObject<E>>
  : T;

export function escapeForJson<T>(val: T): EscapedObject<T> {
  if (val && val instanceof Date) {
    const escapedDate: EscapedDate = {
      __typename: 'EscapedDate',
      isoString: val.toISOString()
    };
    return escapedDate as unknown as EscapedObject<T>;
  } else if (val && val instanceof Set) {
    return {
      __typename: 'EscapedSet',
      values: Array.from(val.values()).map(value => escapeForJson(value))
    } as EscapedObject<T>;
  } else if (val && val instanceof Map) {
    return {
      __typename: 'EscapedMap',
      values: Array.from(val.entries()).map(([key, value]) => [
        escapeForJson(key),
        escapeForJson(value)
      ])
    } as EscapedObject<T>;
  } else if (Array.isArray(val)) {
    return val.map(el => escapeForJson(el)) as EscapedObject<any>;
  } else if (val instanceof Object && isPlainObj(val)) {
    const mappedVal = {...val};
    for (const key in mappedVal) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      mappedVal[key] = escapeForJson(mappedVal[key]);
    }
    return mappedVal as EscapedObject<T>;
  }
  return val as EscapedObject<T>;
}

export function deEscapeFromJson<T>(val: T): UnescapedObject<T> {
  if (val && val instanceof Date) {
    return val as UnescapedObject<T>;
  } else if (val && isEscapedDate(val)) {
    return new Date(val.isoString) as UnescapedObject<T>;
  } else if (val && val instanceof Set) {
    return new Set(
      Array.from(val.values()).map(val => deEscapeFromJson(val))
    ) as UnescapedObject<T>;
  } else if (val && val instanceof Map) {
    return new Map(
      Array.from(val.entries()).map(([key, value]) => [
        deEscapeFromJson(key),
        deEscapeFromJson(value)
      ])
    ) as UnescapedObject<T>;
  } else if (isEscapedSet(val)) {
    return new Set(
      val.values.map(value => deEscapeFromJson(value))
    ) as UnescapedObject<T>;
  } else if (Array.isArray(val)) {
    return val.map(el => deEscapeFromJson(el)) as UnescapedObject<any>;
  } else if (isEscapedMap(val)) {
    return new Map(
      val.values.map(([key, value]) => [
        deEscapeFromJson(key),
        deEscapeFromJson(value)
      ])
    ) as UnescapedObject<T>;
  } else if (val && val instanceof Object) {
    if (isPlainObj(val)) {
      const unescapedVal: T = {...val};
      for (const key in unescapedVal) {
        // @ts-expect-error unable to cast properly
        unescapedVal[key] = deEscapeFromJson(unescapedVal[key]);
      }
      return unescapedVal as unknown as UnescapedObject<T>;
    }
  }
  return val as UnescapedObject<T>;
}

function isEscapedDate(val: any): val is EscapedDate {
  return Boolean(
    val &&
      typeof val === 'object' &&
      val.__typename === 'EscapedDate' &&
      typeof val.isoString === 'string'
  );
}

function isEscapedSet(val: any): val is EscapedSet {
  if (
    val &&
    val instanceof Object &&
    val.__typename === 'EscapedSet' &&
    Array.isArray(val.values)
  ) {
    return true;
  } else {
    return false;
  }
}

function isEscapedMap(val: any): val is EscapedMap {
  if (
    val &&
    val instanceof Object &&
    val.__typename === 'EscapedMap' &&
    Array.isArray(val.values) &&
    val.values.every((item: any) => Array.isArray(item) && item.length === 2)
  ) {
    return true;
  } else {
    return false;
  }
}

function isPlainObj(value: any): value is Record<string, unknown> {
  if (typeof value !== 'object') {
    return false;
  }

  if (value === undefined || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype === null || prototype === Object.getPrototypeOf({})) {
    return true;
  }

  return value.constructor === Object;
}
