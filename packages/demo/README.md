# Mesh Playground

## How to start the Mesh Playground on localhost

In the root folder, 

#### 1. Setup
Run `yarn install && yarn lerna bootstrap && yarn build`:
```sh
yarn install && yarn lerna bootstrap && yarn build
```

#### 2. Add .env variables
In `/packages/demo/`, create a file `.env.local` and fill in the variables:

```
NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET = 
NEXT_PUBLIC_BLOCKFROST_API_KEY_TESTNET = 
NEXT_PUBLIC_INFURA_PROJECT_ID = 
NEXT_PUBLIC_INFURA_PROJECT_SECRET = 
NEXT_PUBLIC_TEST_ADDRESS_MAINNET = 
NEXT_PUBLIC_TEST_ADDRESS_TESTNET = 
```

#### 3. Start Playground
```sh
yarn start
```
and visit [http://localhost:3000/](http://localhost:3000/)

#### After making a change to Mesh package
Run `yarn run build` in `@martifylabs/mesh/packages/module` folder.
