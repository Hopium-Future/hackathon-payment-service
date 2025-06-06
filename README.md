# USE NODE 18
killport 27017 6379 9200 3094

# SSH port
ssh nami_na3_server -Nf -L 27017:localhost:27017 && 
ssh nami_na3_server -Nf -L 6379:localhost:6379 && 
ssh nami_na3_server -Nf -L 9200:localhost:9200 && 
ssh nami_na3_server -Nf -L 3094:localhost:3094 &&
ssh exchange_dev -Nf -L 6378:localhost:6379

ssh exchange_dev3 -Nf -L 30001:localhost:30001 && ssh exchange_dev -Nf -L 3094:localhost:3094 && ssh exchange_dev -Nf -L 6379:localhost:6379 && ssh exchange_dev -Nf -L 5672:localhost:5672 && ssh exchange_dev -Nf -L 9002:localhost:9002
# Adonis API application

This is the boilerplate for creating an API server in AdonisJs, it comes pre-configured with.

1. Bodyparser
2. Authentication
3. CORS
4. Lucid ORM
5. Migrations and seeds

## Setup

Use the adonis command to install the blueprint

```bash
adonis new yardstick --api-only
```

or manually clone the repo and then run `npm install`.


### Migrations

Run the following command to run startup migrations.

```js
adonis migration:run
```

ssh exchange_dev -Nf -L 30001:10.130.227.200:30001
ssh exchange_dev -p 3875 -Nf -L 6379:localhost:6379
ssh exchange_dev -Nf -L 9201:localhost:9200
ssh neo4j -Nf -L 7687:localhost:7687

ssh na3 -Nf -L 6379:localhost:6379
ssh na3 -Nf -L 3094:localhost:3094
ssh na3 -Nf -L 27017:localhost:27017

ssh na3 -Nf -L 5321:localhost:5321