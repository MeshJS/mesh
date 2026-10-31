# Aiken Gov Crowdfunding

## 1. Spend

The spending validator that guarding the crowdfunded

## 2. Start

The withdrawal script that oversight the completion of crowdfunding (i.e. `completion_script` at crowdfunding script). Also as the script for current campaign auth token + all gov power.

## Param dependency tree

1. First layer

   - `spend` - no param

2. Second layer

   - `start` - param `spend`
