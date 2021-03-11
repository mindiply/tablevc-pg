import {escapeForJson, deEscapeFromJson} from '../src/jsonEncoding';

interface TestRecord {
  startDate: Date;
  b: string;
  c: {
    id: number;
    when?: Date | null;
  };
}

describe('Properly prepare dates for storing as JSON', () => {
  describe('Basic scalar conversions', () => {
    test('Non dates', () => {
      expect(escapeForJson(1)).toBe(1);
      expect(deEscapeFromJson(1)).toBe(1);

      expect(escapeForJson('2')).toBe('2');
      expect(deEscapeFromJson('2')).toBe('2');

      expect(escapeForJson(true)).toBe(true);
      expect(deEscapeFromJson(false)).toBe(false);

      expect(escapeForJson([true, false])).toMatchObject([true, false]);
      expect(deEscapeFromJson([true, false])).toMatchObject([true, false]);

      expect(escapeForJson({a: 1, b: 'hello'})).toMatchObject({
        a: 1,
        b: 'hello'
      });
      expect(deEscapeFromJson({a: 1, b: 'hello'})).toMatchObject({
        a: 1,
        b: 'hello'
      });
    });
  });

  describe('Escape values', () => {
    test('Scalar conversion', () => {
      expect(escapeForJson(new Date(2030, 2, 3))).toMatchObject({
        __typename: 'EscapedDate',
        isoString: new Date(2030, 2, 3).toISOString()
      });
    });

    test('Simple object coversions', () => {
      const a: TestRecord = {
        startDate: new Date(2010, 0, 1),
        b: 'test',
        c: {
          id: 1
        }
      };
      expect(escapeForJson(a)).toMatchObject({
        startDate: {
          __typename: 'EscapedDate',
          isoString: new Date(2010, 0, 1).toISOString()
        },
        b: 'test',
        c: {
          id: 1
        }
      });
    });

    test('Serialize single set value', () => {
      expect(escapeForJson(new Set([1, 2]))).toEqual({
        __typename: 'EscapedSet',
        values: [1, 2]
      });

      expect(escapeForJson(new Set(['name1', 'name2']))).toEqual({
        __typename: 'EscapedSet',
        values: ['name1', 'name2']
      });

      expect(escapeForJson(new Set([{a: 1, b: 'h'}]))).toEqual({
        __typename: 'EscapedSet',
        values: [{a: 1, b: 'h'}]
      });
    });

    test('Serialize maps values', () => {
      expect(
        escapeForJson(
          new Map([
            ['a', 1],
            ['b', 2]
          ])
        )
      ).toEqual({
        __typename: 'EscapedMap',
        values: [
          ['a', 1],
          ['b', 2]
        ]
      });
    });

    test('Serialize all types in objects', () => {
      expect(
        escapeForJson({
          a: 'normal',
          b: new Date(2030, 11, 31),
          c: new Set(['a', 'b', 'c']),
          d: new Map([
            ['a', 1],
            ['b', 2]
          ])
        })
      ).toEqual({
        a: 'normal',
        b: {
          __typename: 'EscapedDate',
          isoString: new Date(2030, 11, 31).toISOString()
        },
        c: {
          __typename: 'EscapedSet',
          values: ['a', 'b', 'c']
        },
        d: {
          __typename: 'EscapedMap',
          values: [
            ['a', 1],
            ['b', 2]
          ]
        }
      });
    });

    test('Serialize all types recursively', () => {
      expect(
        escapeForJson([
          {
            a: new Map([
              [
                1,
                {
                  id: 'a',
                  children: new Set([1, 2, 3]),
                  when: new Date(2021, 2, 19)
                }
              ]
            ])
          }
        ])
      ).toEqual([
        {
          a: {
            __typename: 'EscapedMap',
            values: [
              [
                1,
                {
                  id: 'a',
                  children: {
                    __typename: 'EscapedSet',
                    values: [1, 2, 3]
                  },
                  when: {
                    __typename: 'EscapedDate',
                    isoString: new Date(2021, 2, 19).toISOString()
                  }
                }
              ]
            ]
          }
        }
      ]);
    });
  });
});

describe('Deserialize from JSON friendly object', () => {
  describe('Focus on dates', () => {
    test('various levels of depth', () => {
      expect(
        deEscapeFromJson({
          startDate: {
            __typename: 'EscapedDate',
            isoString: new Date(2010, 0, 1).toISOString()
          },
          b: 'test',
          c: {
            id: 1
          }
        })
      ).toMatchObject({
        startDate:  new Date(2010, 0, 1),
        b: 'test',
        c: {
          id: 1
        }
      });

      expect(
        deEscapeFromJson({
          startDate: {
            __typename: 'EscapedDate',
            isoString: new Date(2010, 0, 1).toISOString()
          },
          b: 'test',
          c: {
            id: 1,
            when: null
          }
        })
      ).toMatchObject({
        startDate: new Date(2010, 0, 1),
        b: 'test',
        c: {
          id: 1,
          when: null
        }
      });

      expect(
        deEscapeFromJson({
          startDate: {
            __typename: 'EscapedDate',
            isoString: new Date(2010, 0, 1).toISOString()
          },
          b: 'test',
          c: {
            id: 1,
            when: {
              __typename: 'EscapedDate',
              isoString: new Date(2010, 1, 1).toISOString()
            }
          }
        })
      ).toMatchObject({
        startDate: new Date(2010, 0, 1),
        b: 'test',
        c: {
          id: 1,
          when: new Date(2010, 1, 1)
        }
      });
    });
  });

  describe('Deserialize all types', () => {
    test('Recursive all types', () => {
      expect(
        deEscapeFromJson([
          {
            a: {
              __typename: 'EscapedMap',
              values: [
                [
                  1,
                  {
                    id: 'a',
                    children: {
                      __typename: 'EscapedSet',
                      values: [1, 2, 3]
                    },
                    when: {
                      __typename: 'EscapedDate',
                      isoString: new Date(2021, 2, 19).toISOString()
                    }
                  }
                ]
              ]
            }
          }
        ])
      ).toEqual([
        {
          a: new Map([
            [
              1,
              {
                id: 'a',
                children: new Set([1, 2, 3]),
                when: new Date(2021, 2, 19)
              }
            ]
          ])
        }
      ]);
    });
  });
});
