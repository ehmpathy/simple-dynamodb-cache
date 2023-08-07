# simple-dynamodb-cache

A simple dynamodb cache with time based expiration policies

# features

- simplicity: `get` and `set` with an intuitive, pit-of-success, design
- interoperability: fulfills the standard [SimpleAsyncCache](https://github.com/ehmpathy/with-simple-caching/blob/main/src/domain/SimpleCache.ts#L9-L15) interface
  - can be used with
    - [with-simple-caching](https://github.com/ehmpathy/with-simple-caching)
    - [with-domain-driven-caching](https://github.com/ehmpathy/with-domain-driven-caching)
- garbage collection: uses dynamodb ttl to automatically garbage collect stale entries

# install

```
npm install simple-dynamodb-cache
```

# use

### create a dynamodb table

as you'd expect, this cache persists to dynamodb, so you'll need to define a table it can use

this library expects that the dynamodb table it'll be given has the following attributes
- partitionKey = `p`
- ttlKey = `t`

here's a terraform example for creating a table with this schema
```tf
resource "aws_dynamodb_table" "table_domain_driven_cache" {
  name         = "infrastructure-${var.environment}-table-domain-driven-cache"
  billing_mode = "PAY_PER_REQUEST"
  point_in_time_recovery {
    enabled = var.environment == "prod" ? true : false
  }

  hash_key = "p" # partition key
  ttl {
    enabled        = true
    attribute_name = "t" # ttl key
  }

  attribute {
    name = "p"
    type = "S"
  }
}
```

### create a cache

```ts
const cache = createCache({ table: 'svc-raindrops-prod-cache' });
```

### set to the cache

```ts
await cache.set('answer', '42');
```

***ℹ️ note: if you'd like an item to never expire, set the expiration time to `Infinity`***

### get from the cache

```ts
await cache.get('answer'); // '42'
```
