use bevy::prelude::*;
use bevy_mod_picking::prelude::*;
use bevy_pancam::{PanCam, PanCamPlugin};
use bevy_rand::{plugin::EntropyPlugin, prelude::WyRand};
use tracing::Level;

mod api;
mod asteroid;
mod map;
mod pot;
mod ships;

#[derive(Component)]
struct MyCameraMarker;

fn setup(mut commands: Commands) {
    commands
        .spawn(Camera2dBundle {
            camera: Camera {
                clear_color: ClearColorConfig::Custom(Color::BLACK),
                ..default()
            },
            ..default()
        })
        .insert(PanCam {
            min_scale: 1.,
            // max_scale: Some(3.),
            ..default()
        });
}

fn main() {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();

    App::new()
        .add_plugins(DefaultPlugins.set(ImagePlugin::default_nearest()))
        .add_plugins(PanCamPlugin)
        .add_plugins(EntropyPlugin::<WyRand>::default())
        .add_plugins(DefaultPickingPlugins)
        .add_systems(Startup, setup)
        .add_plugins((
            map::MapPlugin,
            ships::ShipsPlugin,
            asteroid::AsteroidPlugin,
            pot::PotPlugin,
        ))
        .run();
}
