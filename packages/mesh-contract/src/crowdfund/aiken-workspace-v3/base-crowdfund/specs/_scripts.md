# Aiken Crowdfunding

## 1. Auth Token

The token that represent distinct crowdfunding campaign, attaching with distinct `completion_script`

## 2. Shares

The token that represents lovelace contributed to current crowdfunding campaign

## 3. Crowdfund

The validator that handles the crowdfunding campaign

## Param dependency tree

1. First layer

   - `auth_token` - `utxo_ref`

2. Second layer

   - `shares` - param `auth_token`
   - `crowdfund` - param `auth_token`
