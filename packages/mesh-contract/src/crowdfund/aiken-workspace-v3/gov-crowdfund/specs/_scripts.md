# Aiken Gov Crowdfunding

## 1. Spend

The spending validator that guarding the crowdfunded

## 2. Stake

The token that represents lovelace contributed to current crowdfunding campaign

## 3. Start

The withdrawal script that oversight the completion of crowdfunding (i.e. `completion_script` at crowdfunding script)

## Param dependency tree

1. First layer

   - `spend` - no param
   - `stake` - no param

2. Second layer

   - `start` - param `spend` and `stake`
