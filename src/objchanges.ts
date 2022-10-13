interface CompareValuesFn<T> {
  (a: T, b: T): boolean;
}

const defaultCompare: CompareValuesFn<any> = (a, b) => a === b;

/**
 * Produces an object composed only with the fields that have changed in laterEl
 * from baseEl, using the strict === comparison.
 *
 * This is a shallow difference only. Differences in nested arrays or objects are
 * based on object reference only.
 *
 * @param {T} baseEl
 * @param {T} laterEl
 * @returns {Partial<T>}
 */
export const objChanges = <T>(
  baseEl: T,
  laterEl: T,
  compareFn: CompareValuesFn<T[keyof T]> = defaultCompare
): Partial<T> => {
  const changes: Partial<T> = {};
  if (
    baseEl &&
    laterEl &&
    typeof baseEl === 'object' &&
    typeof laterEl === 'object'
  ) {
    for (const f of Object.keys(baseEl)) {
      const fieldName = f as keyof T;
      if (!compareFn(baseEl[fieldName], laterEl[fieldName])) {
        changes[fieldName] = laterEl[fieldName];
      }
    }
  }
  return changes;
};
