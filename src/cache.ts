import { LogMethod, simpleDynamodbClient } from 'simple-dynamodb-client';

const SECONDS_IN_A_YEAR = 365 * 24 * 60 * 60;

export interface SimpleDynamodbCache {
  /**
   * get a value from cache by key
   */
  get: (key: string) => Promise<string | undefined>;

  /**
   * set a value to cache for key
   */
  set: (
    key: string,
    value: string | undefined,
    options?: { secondsUntilExpiration?: number },
  ) => Promise<void>;
}

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
  defaultSecondsUntilExpiration = 5 * 60,
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
  defaultSecondsUntilExpiration?: number | null;

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
      secondsUntilExpiration = defaultSecondsUntilExpiration,
    }: { secondsUntilExpiration?: number | null } = {},
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
    const expiresAtMse =
      secondsUntilExpiration && secondsUntilExpiration < Infinity
        ? getMseNow() + secondsUntilExpiration * 1000
        : getMseNow() + 10 * SECONDS_IN_A_YEAR; // aws wont enforce ttl if timestamp is 5+ years in the future; use 10 for good measure; https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/howitworks-ttl.html
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
