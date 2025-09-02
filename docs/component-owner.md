# Component Owner Guide

The doc outlines the way of using [Mesh Opensource Project](https://github.com/orgs/MeshJS/projects/1) board, particularly to team who own a component (e.g. `mesh-transaction` as a component).

## Project Hygiene

1. Only pick active tasks into project task board
2. Only assign to persons if actively working on issues

## Project Owner Guide

### Top Level Goal

1. Complete org-level quarter goal
2. Reserve 20% capacity for non-org-level issues (bug -> documentation -> task -> feature)

### Regular Activities

1. Select issues from `Backlogs`
2. Perform issue classification + assign task owner
3. Unselecting issues if considered not important anymore. Drop assignees if task owner no longer actively investigating

### Issue Classification

1. Assign Types

   - `Feature`: a new feature to be implemented
   - `Bug`: fixing a bug of existing feature
   - `Task`: anything not related to core capability of SDKs (e.g. github workflow)
   - `Documentation`: Generally improving documentation

2. Assign Priority

   - `High`: Affecting key users / a number of users. High strategic value as if blocking some other key developments. e.g. constant update on next hardfork, execution of core delivery of Catalyst milestone, key bugs affecting many users.
   - `Medium`: Edge case scenario hurting feature completeness / really nice to have feature / confusion of implementation or documentation that didnt harm usability.
   - `Low`: Minor fix, improvement of features. Request by specific user without generalization for wider community. Or anything cannot assess with priority at the moment

3. Assign Difficulty

   - `High`: Take more than a week of man power to finish
   - `Medium`: Take more than one day, less than a week of man power to finish
   - `Low`: Can complete a few similar kind of tasks within one man day

4. Assign Assignees
   - Assign the member to handle the tasks
   - The assignee could change when it move along the status (e.g. development by one, review by another, document by the 3rd person)
   - Never assign to anyone without actively looking into issue

## Note

- Label is not used at the moment, can explore or delete if needed
- Add dependency if any
