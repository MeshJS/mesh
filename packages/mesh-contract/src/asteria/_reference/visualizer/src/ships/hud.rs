use bevy::prelude::*;
use bevy_mod_picking::prelude::*;

use crate::map::{Fuel, Position, ShipIdentity};

#[derive(States, Debug, Clone, Eq, PartialEq, Hash)]
pub struct HudState(pub Option<Entity>);

pub fn render_hud(
    mut commands: Commands,
    query: Query<
        (Option<&PickingInteraction>, &ShipIdentity, &Position, &Fuel),
        With<ShipIdentity>,
    >,
    asset_server: Res<AssetServer>,
    mut state: ResMut<NextState<HudState>>,
) {
    let text_style = TextStyle {
        font: asset_server.load("fonts/pixel.otf"),
        font_size: 32.0,
        color: Color::GOLD,
    };

    for (i, s, p, f) in &query {
        if let Some(PickingInteraction::Pressed) = i {
            state.set(HudState(Some(
                commands
                    .spawn(NodeBundle {
                        style: Style {
                            width: Val::Percent(100.0),
                            height: Val::Percent(100.0),
                            align_items: AlignItems::Center,
                            justify_content: JustifyContent::Center,
                            ..default()
                        },
                        ..default()
                    })
                    .with_children(|parent| {
                        parent
                            .spawn(NodeBundle {
                                style: Style {
                                    width: Val::Percent(50.),
                                    height: Val::Percent(40.),
                                    border: UiRect::all(Val::Px(2.)),
                                    flex_wrap: FlexWrap::Wrap,
                                    padding: UiRect{
                                        left: Val::Px(12.), 
                                        right: Val::Px(12.), 
                                        ..default()
                                    },
                                    ..default()
                                },
                                background_color: Color::DARK_GRAY.into(),
                                border_color: Color::GOLD.into(),
                                ..default()
                            })
                            .with_children(|parent| {
                                parent
                                    .spawn(NodeBundle {
                                        style: Style {
                                            width: Val::Percent(100.),
                                            height: Val::Px(60.),
                                            border: UiRect::bottom(Val::Px(2.)),
                                            align_items: AlignItems::Center,
                                            justify_content: JustifyContent::SpaceBetween,
                                            ..default()
                                        },
                                        border_color: Color::GOLD.into(),
                                        ..default()
                                    })
                                    .with_children(|parent| {
                                        parent.spawn(TextBundle::from_section(
                                            "Ship Detail",
                                            text_style.clone(),
                                        ));

                                        parent
                                            .spawn((
                                                ButtonBundle {
                                                    style: Style {
                                                        width: Val::Px(30.),
                                                        height: Val::Px(30.),
                                                        ..default()
                                                    },
                                                    background_color: Color::DARK_GRAY
                                                        .into(),
                                                    ..default()
                                                },
                                                On::<Pointer<Click>>::run(move |mut commands: Commands, state: Res<State<HudState>>,| {
                                                    commands.entity(state.get().0.unwrap()).despawn_recursive();
                                                }),
                                            ))
                                            .with_children(|parent| {
                                                parent.spawn(TextBundle::from_section(
                                                    "X",
                                                    text_style.clone(),
                                                ));
                                            });
                                    });

                                parent
                                    .spawn(NodeBundle {
                                        style: Style {
                                            width: Val::Percent(100.),
                                            height: Val::Px(60.),
                                            border: UiRect::bottom(Val::Px(1.)),
                                            align_items: AlignItems::Center,
                                            justify_content: JustifyContent::SpaceBetween,
                                            margin: UiRect::all(Val::Px(4.)),
                                            ..default()
                                        },
                                        ..default()
                                    })
                                    .with_children(|parent| {
                                        parent.spawn(TextBundle::from_section(
                                            "Name",
                                            text_style.clone(),
                                        ));
                                        parent.spawn(TextBundle::from_section(
                                            &s.name,
                                            text_style.clone(),
                                        ));
                                    });

                                parent
                                    .spawn(NodeBundle {
                                        style: Style {
                                            width: Val::Percent(100.),
                                            height: Val::Px(60.),
                                            border: UiRect::bottom(Val::Px(1.)),
                                            align_items: AlignItems::Center,
                                            justify_content: JustifyContent::SpaceBetween,
                                            margin: UiRect::all(Val::Px(4.)),
                                            ..default()
                                        },
                                        ..default()
                                    })
                                    .with_children(|parent| {
                                        parent.spawn(TextBundle::from_section(
                                            "Position",
                                            text_style.clone(),
                                        ));
                                        parent.spawn(TextBundle::from_section(
                                            format!("({},{})", p.x, p.y),
                                            text_style.clone(),
                                        ));
                                    });

                                parent
                                    .spawn(NodeBundle {
                                        style: Style {
                                            width: Val::Percent(100.),
                                            height: Val::Px(60.),
                                            border: UiRect::bottom(Val::Px(1.)),
                                            align_items: AlignItems::Center,
                                            justify_content: JustifyContent::SpaceBetween,
                                            margin: UiRect::all(Val::Px(4.)),
                                            ..default()
                                        },
                                        ..default()
                                    })
                                    .with_children(|parent| {
                                        parent.spawn(TextBundle::from_section(
                                            "Fuel Available",
                                            text_style.clone(),
                                        ));
                                        parent.spawn(TextBundle::from_section(
                                            f.available.to_string(),
                                            text_style.clone(),
                                        ));
                                    });
                            });
                    })
                    .id(),
            )));
        }
    }
}
