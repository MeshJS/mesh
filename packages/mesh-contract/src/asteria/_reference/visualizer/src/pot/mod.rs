use crate::map::{Position, PotIdentity};
use bevy::prelude::*;

use self::hud::{render_hud, HudState};

mod hud;

const TILE_SIZE: u32 = 64;

#[derive(Resource)]
pub struct Material {
    texture: Handle<Image>,
    layout: Handle<TextureAtlasLayout>,
}

impl FromWorld for Material {
    fn from_world(world: &mut World) -> Self {
        let texture: Handle<Image> = world
            .get_resource::<AssetServer>()
            .unwrap()
            .load("pot/sprite.png");

        let layout = world
            .get_resource_mut::<Assets<TextureAtlasLayout>>()
            .unwrap()
            .add(TextureAtlasLayout::from_grid(
                Vec2::new(TILE_SIZE as f32, TILE_SIZE as f32),
                7,
                1,
                None,
                None,
            ));

        Self { texture, layout }
    }
}

#[derive(Bundle)]
pub struct Pot {
    sprite_sheet: SpriteSheetBundle,
    position: Position,
    identity: PotIdentity,
}

impl Pot {
    pub fn new(identity: PotIdentity, position: Position, material: &Material) -> Self {
        Self {
            sprite_sheet: SpriteSheetBundle {
                atlas: TextureAtlas {
                    layout: material.layout.clone(),
                    index: 0,
                },
                transform: Transform {
                    scale: Vec3::new(0.8, 0.8, 1.0),
                    ..Default::default()
                },
                texture: material.texture.clone(),
                ..Default::default()
            },
            position,
            identity,
        }
    }
}

fn render(mut query: Query<(&mut Transform, &Position)>) {
    for (mut t, p) in query.iter_mut() {
        t.translation = Vec3::new(
            (p.x * TILE_SIZE as i32) as f32,
            (p.y * TILE_SIZE as i32) as f32,
            1.0,
        );
    }
}

pub struct PotPlugin;

impl Plugin for PotPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Material>()
            .add_systems(Update, (render, render_hud))
            .insert_state(HudState(None));
    }
}
