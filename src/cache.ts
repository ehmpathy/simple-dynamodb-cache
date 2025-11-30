import { toMilliseconds, type UniDuration } from '@ehmpathy/uni-time';
import { type LogMethod, simpleDynamodbClient } from 'simple-dynamodb-client';
import type { SimpleAsyncCache } from 'with-simple-cache';

export type SimpleDynamodbCache = SimpleAsyncCache<string>;

const getMseNow = () => new Date().getTime();

/**
 * a utility function for deciding whether a record is valid
 */
export const isRecordExpired = ({
  expiresAtMse,
}: {
  expiresAtMse: number | null;
}): boolean => {
  // if expiresAtMse = null, then it never expires
  if (expiresAtMse === null) return false;

  // otherwise, check whether its expired
  return expiresAtMse < getMseNow();
};

export const createCache = ({
  dynamodbTableName,
  expiration: defaultExpiration = { minutes: 5 },
  logDebug = () => {},
}: {
  /**
   * specifies the name of the dynamodb table in which cached items will be persisted
   *
   * note
   * - see readme for an example of table schema
   */
  dynamodbTableName: string;

  /**
   * specifies the default number of seconds until a record is considered expired
   *
   * note
   * - use `null` for "never expire"
   */
  expiration?: UniDuration | null;

  /**
   * specifies an optional logger to use to log dynamodb requests
   */
  logDebug?: LogMethod;
}): SimpleDynamodbCache => {
  // define how to set an item into the cache
  const set = async (
    key: string,
    value: string | undefined,
    {
      expiration = defaultExpiration,
    }: { expiration?: UniDuration | null } = {},
  ) => {
    // handle cache invalidation
    if (value === undefined)
      return await simpleDynamodbClient.delete({
        tableName: dynamodbTableName,
        logDebug,
        key: {
          p: key,
        },
      });

    // handle set
    const expirationMillisRaw = expiration
      ? toMilliseconds(expiration)
      : Infinity;
    const expirationMillisSafe = Math.min(
      // cap the value at a max of 10years
      toMilliseconds({ days: 365 * 10 }), // aws wont enforce ttl if timestamp is 5+ years in the future; use 10 for good measure; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/howitworks-ttl.html

      // as otherwise, dynamodb fails on values like "Infinity"
      expirationMillisRaw,
    );
    const expiresAtMse = getMseNow() + expirationMillisSafe;
    await simpleDynamodbClient.put({
      tableName: dynamodbTableName,
      logDebug,
      item: {
        p: key,
        v: { expiresAtMse, value },
        t: expiresAtMse,
      },
    });
  };

  // define how to get an item from the cache
  const get = async (key: string) => {
    const cacheContent:
      | { v: { expiresAtMse: number; value: string } }
      | undefined = (await simpleDynamodbClient.get({
      tableName: dynamodbTableName,
      logDebug,
      attributesToRetrieveInQuery: ['v'],
      key: {
        p: key,
      },
    })) as any;
    if (!cacheContent) return undefined;
    if (isRecordExpired({ expiresAtMse: cacheContent.v.expiresAtMse }))
      return undefined; // if already expired, then undefined
    return cacheContent.v.value; // otherwise, its in the cache and not expired, so return the value
  };

  /**
   * return the api
   */
  return {
    set,
    get,
  };
};
