use async_graphql::http::GraphiQLSource;
use dotenv::dotenv;
use num_traits::cast::ToPrimitive;
use num_traits::Zero;
use rocket::response::content::RawHtml;
use sqlx::types::BigDecimal;
use std::env;
use std::ops::Deref;
use std::vec;

use async_graphql::*;
use async_graphql_rocket::GraphQLRequest as Request;
use async_graphql_rocket::GraphQLResponse as Response;
use rocket::State;

struct QueryRoot;

#[derive(Clone, SimpleObject)]
pub struct Ship {
    id: ID,
    fuel: i32,
    position: Position,
    shipyard_policy: PolicyId,
    ship_token_name: AssetName,
    pilot_token_name: AssetName,
    class: String,
}

#[derive(Clone, SimpleObject)]
pub struct Fuel {
    id: ID,
    fuel: i32,
    position: Position,
    shipyard_policy: PolicyId,
    class: String,
}

#[derive(Clone, SimpleObject)]
pub struct Asteria {
    id: ID,
    position: Position,
    total_rewards: i64,
    class: String,
}

#[derive(Clone, SimpleObject)]
pub struct AsteriaState {
    ship_counter: i32,
    shipyard_policy: PolicyId,
    reward: i64,
}

#[derive(Clone, SimpleObject)]
pub struct Position {
    x: i32,
    y: i32,
}

#[derive(Clone, SimpleObject)]
pub struct PolicyId {
    id: ID,
}

#[derive(Clone, SimpleObject)]
pub struct AssetName {
    name: String,
}

#[derive(InputObject)]
pub struct AssetNameInput {
    name: String,
}

#[derive(InputObject, Clone, Copy)]
pub struct PositionInput {
    x: i32,
    y: i32,
}

#[derive(SimpleObject, Clone)]
pub struct ShipAction {
    action_id: ID,
    ship_id: ID,
    action_type: ShipActionType,
    position: Position,
    timestamp: String,
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum ShipActionType {
    Move,
    GatherFuel,
}

#[derive(Union)]
pub enum MapObject {
    Ship(Ship),
    Fuel(Fuel),
    Asteria(Asteria),
}

#[derive(Interface)]
#[graphql(
    field(name = "position", ty = "&Position"),
    field(name = "class", ty = "String")
)]

pub enum PositionalInterface {
    Ship(Ship),
    Fuel(Fuel),
    Asteria(Asteria),
}

#[derive(Debug)]
struct MapObjectRecord {
    id: Option<String>,
    fuel: Option<i32>,
    position_x: Option<i32>,
    position_y: Option<i32>,
    policy_id: Option<String>,
    token_name: Option<String>,
    pilot_name: Option<String>,
    class: Option<String>,
    total_rewards: Option<BigDecimal>,
}

#[Object]
impl QueryRoot {
    async fn ship(&self, ctx: &Context<'_>, ship_token_name: AssetNameInput) -> Result<Ship> {
        // Access the connection pool from the GraphQL context
        let pool = ctx
            .data::<sqlx::PgPool>()
            .map_err(|e| Error::new(e.message))?;

        let shipyard_policy_id = ctx
            .data::<PolicyId>()
            .map_err(|e| Error::new(e.message))?;

        // Query to select a ship by token name
        let fetched_ship = sqlx::query_as!(MapObjectRecord,
            "SELECT id, fuel, positionX as position_x, positionY as position_y, shipyardPolicy as policy_id, shipTokenName as token_name, pilotTokenName as pilot_name, class, totalRewards as total_rewards
             FROM mapobjects
             WHERE shipTokenName = $1 AND shipyardPolicy = $2",
            ship_token_name.name, shipyard_policy_id.id.to_string()
        );

        let record = fetched_ship
            .fetch_one(pool)
            .await
            .map_err(|e| Error::new(e.to_string()))?;

        match record.class.as_deref() {
            Some("Ship") => Ok(Ship {
                id: ID::from(record.id.unwrap_or_default()),
                fuel: record.fuel.unwrap_or(0),
                position: Position {
                    x: record.position_x.unwrap_or(0),
                    y: record.position_y.unwrap_or(0),
                },
                shipyard_policy: PolicyId {
                    id: ID::from(record.policy_id.unwrap_or_default()),
                },
                ship_token_name: AssetName {
                    name: record.token_name.unwrap_or_default(),
                },
                pilot_token_name: AssetName {
                    name: record.pilot_name.unwrap_or_default(),
                },
                class: record.class.unwrap_or_default(),
            }),
            _ => panic!("Unknown class type or class not provided"),
        }
    }

    async fn ships(
        &self,
        ctx: &Context<'_>,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<Ship>> {
        // Access the connection pool from the GraphQL context
        let pool = ctx
            .data::<sqlx::PgPool>()
            .map_err(|e| Error::new(e.message))?;

        let shipyard_policy_id = ctx
            .data::<PolicyId>()
            .map_err(|e| Error::new(e.message))?;

        let mut ships = Vec::new();

        let num_ships = limit.unwrap_or(10) as i64;

        let start = offset.unwrap_or(0) as i64;

        // Query to select ships
        let fetched_ships = sqlx::query_as!(MapObjectRecord,
            "SELECT id, fuel, positionX as position_x, positionY as position_y, shipyardPolicy as policy_id, shipTokenName as token_name, pilotTokenName as pilot_name, class, totalRewards as total_rewards
             FROM mapobjects
             WHERE class = 'Ship' AND shipyardPolicy = $1
             LIMIT $2 OFFSET $3",
            shipyard_policy_id.id.to_string(), num_ships, start
        )
        .fetch_all(pool)
        .await
        .map_err(|e| Error::new(e.to_string()))?;

        for record in fetched_ships {
            ships.push(Ship {
                id: ID::from(record.id.unwrap_or_default()),
                fuel: record.fuel.unwrap_or(0),
                position: Position {
                    x: record.position_x.unwrap_or(0),
                    y: record.position_y.unwrap_or(0),
                },
                shipyard_policy: PolicyId {
                    id: ID::from(record.policy_id.unwrap_or_default()),
                },
                ship_token_name: AssetName {
                    name: record.token_name.unwrap_or_default(),
                },
                pilot_token_name: AssetName {
                    name: record.pilot_name.unwrap_or_default(),
                },
                class: record.class.unwrap_or_default(),
            });
        }

        Ok(ships)

    }

    async fn fuel_pellets(
        &self,
        ctx: &Context<'_>,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Result<Vec<Fuel>> {
        // Access the connection pool from the GraphQL context
        let pool = ctx
            .data::<sqlx::PgPool>()
            .map_err(|e| Error::new(e.message))?;

        let shipyard_policy_id = ctx
            .data::<PolicyId>()
            .map_err(|e| Error::new(e.message))?;

        let mut fuels = Vec::new();

        let num_fuels = limit.unwrap_or(10) as i64;

        let start = offset.unwrap_or(0) as i64;

        // Query to select fuel pellets
        let fetched_fuels = sqlx::query_as!(MapObjectRecord,
            "SELECT id, fuel, positionX as position_x, positionY as position_y, shipyardPolicy as policy_id, shipTokenName as token_name, pilotTokenName as pilot_name, class, totalRewards as total_rewards
             FROM mapobjects
             WHERE class = 'Fuel' AND shipyardPolicy = $1
             LIMIT $2 OFFSET $3",
            shipyard_policy_id.id.to_string(), num_fuels, start
        )
        .fetch_all(pool)
        .await
        .map_err(|e| Error::new(e.to_string()))?;
        
        for record in fetched_fuels {
            fuels.push(Fuel {
                id: ID::from(record.id.unwrap_or_default()),
                fuel: record.fuel.unwrap_or(0),
                position: Position {
                    x: record.position_x.unwrap_or(0),
                    y: record.position_y.unwrap_or(0),
                },
                shipyard_policy: PolicyId {
                    id: ID::from(record.policy_id.unwrap_or_default()),
                },
                class: record.class.unwrap_or_default(),
            });
        }

        Ok(fuels)
    }

    async fn asteria(&self, ctx: &Context<'_>) -> Result<AsteriaState> {
        // Access the connection pool from the GraphQL context
        let pool = ctx
            .data::<sqlx::PgPool>()
            .map_err(|e| Error::new(e.message))?;

        let shipyard_policy_id = ctx
            .data::<PolicyId>()
            .map_err(|e| Error::new(e.message))?;

        // Query to select the number of ships and the shipyard policy
        let fetched_asteria_state = sqlx::query_as!(MapObjectRecord,
            "SELECT id, fuel, positionX as position_x, positionY as position_y, shipyardPolicy as policy_id, shipTokenName as token_name, pilotTokenName as pilot_name, class, totalRewards as total_rewards
             FROM mapobjects
             WHERE class = 'Asteria' AND shipyardPolicy = $1",
            shipyard_policy_id.id.to_string()
        )
        .fetch_one(pool)
        .await
        .map_err(|e| Error::new(e.to_string()))?;

        Ok(AsteriaState {
            ship_counter: fetched_asteria_state.fuel.unwrap_or(0),
            shipyard_policy: PolicyId {
                id: ID::from(fetched_asteria_state.policy_id.unwrap_or_default()),
            },
            reward: fetched_asteria_state
                .total_rewards
                .unwrap_or(BigDecimal::zero())
                .to_i64()
                .unwrap(),
        })
    }

    async fn objects_in_radius(
        &self,
        ctx: &Context<'_>,
        center: PositionInput,
        radius: i32,
    ) -> Result<Vec<MapObject>, Error> {
        // Access the connection pool from the GraphQL context
        let pool = ctx
            .data::<sqlx::PgPool>()
            .map_err(|e| Error::new(e.message))?;

        let shipyard_policy_id = ctx
            .data::<PolicyId>()
            .map_err(|e| Error::new(e.message))?;

        // Query to select map objects within a radius using Manhattan distance
        let fetched_objects = sqlx::query_as!(MapObjectRecord,
            "SELECT id, fuel, positionX as position_x, positionY as position_y, shipyardPolicy as policy_id, shipTokenName as token_name, pilotTokenName as pilot_name, class, totalRewards as total_rewards
             FROM mapobjects
             WHERE positionX BETWEEN ($1::int - $3::int) AND ($1::int + $3::int)
               AND positionY BETWEEN ($2::int - $3::int) AND ($2::int + $3::int)
               AND ABS(positionX - $1::int) + ABS(positionY - $2::int) <= $3::int
               AND shipyardPolicy = $4::text",
            center.x, center.y, radius, shipyard_policy_id.id.to_string()
        )
        .fetch_all(pool)
        .await
        .map_err(|e| Error::new(e.to_string()))?;
        let map_objects: Vec<MapObject> = fetched_objects
            .into_iter()
            .map(|record| match record.class.as_deref() {
                Some("Ship") => MapObject::Ship(Ship {
                    id: ID::from(record.id.unwrap_or_default()),
                    fuel: record.fuel.unwrap_or(0),
                    position: Position {
                        x: record.position_x.unwrap_or(0),
                        y: record.position_y.unwrap_or(0),
                    },
                    shipyard_policy: PolicyId {
                        id: ID::from(record.policy_id.unwrap_or_default()),
                    },
                    ship_token_name: AssetName {
                        name: record.token_name.unwrap_or_default(),
                    },
                    pilot_token_name: AssetName {
                        name: record.pilot_name.unwrap_or_default(),
                    },
                    class: record.class.unwrap_or_default(),
                }),
                Some("Fuel") => MapObject::Fuel(Fuel {
                    id: ID::from(record.id.unwrap_or_default()),
                    fuel: record.fuel.unwrap_or(0),
                    position: Position {
                        x: record.position_x.unwrap_or(0),
                        y: record.position_y.unwrap_or(0),
                    },
                    shipyard_policy: PolicyId {
                        id: ID::from(record.policy_id.unwrap_or_default()),
                    },
                    class: record.class.unwrap_or_default(),
                }),
                Some("Asteria") => MapObject::Asteria(Asteria {
                    id: ID::from(record.id.unwrap_or_default()),
                    position: Position {
                        x: record.position_x.unwrap_or(0),
                        y: record.position_y.unwrap_or(0),
                    },
                    total_rewards: record
                        .total_rewards
                        .unwrap_or(BigDecimal::zero())
                        .to_i64()
                        .unwrap(),
                    class: record.class.unwrap_or_default(),
                }),
                _ => panic!("Unknown class type or class not provided"),
            })
            .collect();

        Ok(map_objects)
    }

    async fn all_ship_actions(
        &self,
        _ctx: &Context<'_>,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Vec<ShipAction> {
        let mut actions = Vec::new();
        let num_actions = limit.unwrap_or(10) as usize;
        let start = offset.unwrap_or(0) as usize;

        // Generate fake data for ship actions
        for i in start..(start + num_actions) {
            actions.push(ShipAction {
                action_id: ID::from(format!("action-{}", i)),
                ship_id: ID::from("ship-1"),
                action_type: ShipActionType::Move,
                position: Position {
                    x: i as i32 * 5,
                    y: i as i32 * 10,
                },
                timestamp: "01/01/1971".to_string(),
            });
        }

        actions
    }

    async fn ship_actions(
        &self,
        _ctx: &Context<'_>,
        ship_id: ID,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> Vec<ShipAction> {
        let mut actions = Vec::new();
        let num_actions = limit.unwrap_or(5) as usize;
        let start = offset.unwrap_or(0) as usize;

        // Generate fake data for specific ship actions
        for i in start..(start + num_actions) {
            actions.push(ShipAction {
                action_id: ID::from(format!("action-{}-{}", *ship_id, i)),
                ship_id: ship_id.clone(),
                action_type: if i % 2 == 0 {
                    ShipActionType::Move
                } else {
                    ShipActionType::GatherFuel
                },
                position: Position {
                    x: 100 + i as i32,
                    y: 200 + i as i32,
                },
                timestamp: "01/01/1971".to_string(),
            });
        }

        actions
    }
}

type AsteriaSchema = Schema<QueryRoot, EmptyMutation, EmptySubscription>;

#[macro_use]
extern crate rocket;

#[get("/")]
fn index() -> &'static str {
    "Hello, world!"
}

#[rocket::post("/graphql", data = "<request>", format = "application/json")]
async fn graphql_request(schema: &State<AsteriaSchema>, request: Request) -> Response {
    request.execute(schema.deref()).await
}

#[rocket::get("/graphql")]
async fn graphiql() -> RawHtml<String> {
    rocket::response::content::RawHtml(GraphiQLSource::build().endpoint("/graphql").finish())
}

#[launch]
async fn rocket() -> _ {
    dotenv().ok();

    let database_url =
        env::var("DATABASE_URL").expect("DATABASE_URL must be set in the environment");

    let shipyard_policy_id =
        env::var("SHIPYARD_POLICY_ID").expect("SHIPYARD_POLICY_ID must be set in the environment");

    let shipyard_policy_id = PolicyId {
        id: ID::from(shipyard_policy_id),
    };

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url.as_str())
        .await
        .expect("Failed to create pool");

    let schema = Schema::build(QueryRoot, EmptyMutation, EmptySubscription)
        .register_output_type::<PositionalInterface>()
        .data(pool.clone())
        .data(shipyard_policy_id)
        .finish();

    rocket::build()
        .manage(schema)
        .mount("/", routes![index, graphql_request, graphiql])
}
