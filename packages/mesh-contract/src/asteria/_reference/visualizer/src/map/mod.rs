use async_compat::Compat;
use bevy::{prelude::*, tasks::IoTaskPool};
use crossbeam_channel::{bounded, Receiver};
use std::{thread::sleep, time::Duration};

use crate::api::{get_assets, AssetDto};

#[derive(Component)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}
impl Position {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

#[derive(Component)]
pub struct Fuel {
    pub available: u32,
}
impl Fuel {
    pub fn new(available: u32) -> Self {
        Self { available }
    }
}

#[derive(Component)]
pub struct ShipIdentity {
    pub name: String,
}
impl ShipIdentity {
    pub fn new(name: String) -> Self {
        Self { name }
    }
}

#[derive(Component)]
pub struct AsteroidIdentity;

#[derive(Component)]
pub struct PotIdentity {
    pub total_rewards: u32,
}
impl PotIdentity {
    pub fn new(total_rewards: u32) -> Self {
        Self { total_rewards }
    }
}

#[derive(Resource, Deref)]
struct StreamReceiver(Receiver<Vec<AssetDto>>);

#[derive(Event)]
struct StreamEvent(Vec<AssetDto>);

#[derive(States, Debug, Clone, Eq, PartialEq, Hash)]
struct AssetOnMap {
    entity: Entity,
    id: String,
}
#[derive(States, Debug, Clone, Eq, PartialEq, Hash)]
pub struct MapState(Vec<AssetOnMap>);

fn load_assets_map(mut commands: Commands) {
    let (tx, rx) = bounded::<Vec<AssetDto>>(1);
    let future = async move {
        loop {
            let assets_result = get_assets().await;

            if let Err(err) = assets_result {
                error!(error = err.to_string(), "Error to load assets");
                return;
            }

            let assets = assets_result.unwrap();
            tx.send(assets).unwrap();

            let duration = Duration::from_secs(1);
            sleep(duration);
        }
    };
    IoTaskPool::get().spawn(Compat::new(future)).detach();
    commands.insert_resource(StreamReceiver(rx));
}
fn read_load_assets_stream(receiver: Res<StreamReceiver>, mut events: EventWriter<StreamEvent>) {
    for from_stream in receiver.try_iter() {
        events.send(StreamEvent(from_stream));
    }
}
fn spawn_assets(
    mut commands: Commands,
    mut reader: EventReader<StreamEvent>,
    ship_material: Res<crate::ships::ShipMaterial>,
    asteroid_material: Res<crate::asteroid::Material>,
    pot_material: Res<crate::pot::Material>,
    mut state_mut: ResMut<NextState<MapState>>,
    state: Res<State<MapState>>,
) {
    for event in reader.read() {
        let mut assets_on_map = state.get().0.clone();
        for asset in event.0.iter() {
            if let Some(asset_on_map) = state.get().0.iter().find(|a| a.id == asset.id) {
                let mut entity = commands.get_entity(asset_on_map.entity).unwrap();
                let position = Position::new(asset.position.x, asset.position.y);
                entity.insert(position);
            } else {
                let entity = match asset.class {
                    crate::api::AssetClass::Ship => commands.spawn(crate::ships::Ship::new(
                        ShipIdentity::new(asset.ship_token_name.as_ref().unwrap().name.clone()),
                        Position::new(asset.position.x, asset.position.y),
                        Fuel::new(asset.fuel.unwrap()),
                        &ship_material,
                    )),
                    crate::api::AssetClass::Fuel => commands.spawn(crate::asteroid::Asteroid::new(
                        Position::new(asset.position.x, asset.position.y),
                        Fuel::new(asset.fuel.unwrap()),
                        &asteroid_material,
                    )),
                    crate::api::AssetClass::Asteria => commands.spawn(crate::pot::Pot::new(
                        PotIdentity::new(asset.total_rewards.unwrap()),
                        Position::new(asset.position.x, asset.position.y),
                        &pot_material,
                    )),
                };
                assets_on_map.push(AssetOnMap {
                    entity: entity.id(),
                    id: asset.id.clone(),
                });
            }
        }
        state_mut.set(MapState(assets_on_map));
    }
}

pub struct MapPlugin;

impl Plugin for MapPlugin {
    fn build(&self, app: &mut App) {
        app.add_event::<StreamEvent>()
            .add_systems(Startup, load_assets_map)
            .add_systems(Update, (read_load_assets_stream, spawn_assets))
            .insert_state(MapState(Vec::new()));
    }
}
