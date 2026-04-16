import { WIDGET_GROWTH, GROWTH_TEMPLATES } from './constants.js';

/**
 * Skill Logic Types:
 * 1. FIXED_CHANCE: Chance is constant (e.g., 20%), Magnitude (X) scales with level.
 * 2. FIXED_MAGNITUDE: Magnitude is constant (e.g., 50%), Chance (X) scales with level.
 * 3. PASSIVE: 100% chance, Magnitude (X) scales with level.
 */

export const HEROES = {
    "Zoe": {
        type: "Inf",
        template: "GROWTH_TEMPLATES.SEASON_2",
        widget: { stat: "attack", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Sundering" , ids: [102], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => 0.20, getMagnitude: (X) => X / 100, duration: 3},
            { name: "Charisma"  , ids: [102], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Infinite"  , ids: [101], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.50, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
  "Marlin": {
        type: "Arc",
        template: "GROWTH_TEMPLATES.SEASON_2",
        widget: { stat: "lethality", context: "offensive", values: WIDGET_GROWTH },
        skills: [
            { name: "Wild Card", ids: [102], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0},
            { name: "Rumhead", ids: [202], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.2, getMagnitude: (X) => X / 100, duration: 2},
            { name: "Dynamo", ids: [101], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Jabel": {
        type: "Cav",
        template: "GROWTH_TEMPLATES.SEASON_1",
        widget: { stat: "lethality", context: "defensive", values: WIDGET_GROWTH },
        skills: [
            { name: "Rally Flag", ids: [201], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0},
            { name: "Hero's Domain", ids: [101], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Youthful Rage", ids: [101], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Howard": {
        type: "Inf",
        template: "GROWTH_TEMPLATES.SR",
        skills: [
            { name: "Defender", ids: [201], group: "num", values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Weaken", ids: [202], group: "num", values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Chenko": {
        type: "Cav",
        template: "GROWTH_TEMPLATES.SR",
        skills: [
            { name: "Stand of Arms", ids: [101], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Shield Wall", ids: [201], group: "num", values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Quinn": {
        type: "Arc",
        template: "GROWTH_TEMPLATES.SR",
        skills: [
            { name: "Sixth Sense", ids: [201], group: "num", values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Precision Shot", ids: [101], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Gordon": {
        type: "Cav",
        template: "GROWTH_TEMPLATES.SR",
        skills: [
            { name: "Super Nutrients", ids: [203], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Trash Talk", ids: [102], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Petra": {
        type: "Cav",
        template: "GROWTH_TEMPLATES.SEASON_3",
        widget: { stat: "attack", context: "offensive", values: WIDGET_GROWTH },
        skills: [
            { name: "Evil Eye", ids: [101], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0},
            { name: "The Favor", ids: [101], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0},
            { name: "The Shield", ids: [201], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.4, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Amane": {
        type: "Arc",
        template: "GROWTH_TEMPLATES.SR",
        skills: [
            { name: "Tri-Phalanx", ids: [102], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Yeonwoo": {
        type: "Arc",
        template: "GROWTH_TEMPLATES.SR",
        skills: [
            { name: "On Guard", ids: [101], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Saul": {
        type: "Arc",
        template: "GROWTH_TEMPLATES.SEASON_1",
        widget: { stat: "attack", context: "defensive", values: WIDGET_GROWTH },
        skills: [
            { name: "Taskforce", ids: [204, 203], group: "den", values: [[2, 3], [4, 6], [6, 9], [8, 12], [10, 15]], getChance: (X) => 1.0, getMagnitude: (X) => [X[0] / 100, X[1] / 100], duration: 0
            { name: "Positional", ids: [101], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Fahd": {
        type: "Cav",
        template: "GROWTH_TEMPLATES.SR",
        skills: [
            { name: "Desert Eclipse", ids: [205], group: "num", values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Hilde": {
        type: "Cav",
        template: "GROWTH_TEMPLATES.SEASON_2",
        widget: { stat: "health", context: "defensive", values: WIDGET_GROWTH },
        skills: [
            { name: "Noble Path", ids: [102, 204], group: "num", values: [[3, 2], [6, 4], [9, 6], [12, 8], [15, 10]], getChance: (X) => 1.0, getMagnitude: [X[0] / 100, X[1] / 100], duration: 0},
            { name: "Elixir of Strength", ids: [102], group: "num", values: [120, 140, 160, 180, 200], getChance: (X) => 0.25, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Trial by Fire", ids: [201], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0}
        ]
    },
    "Eric": {
        type: "Inf",
        template: "GROWTH_TEMPLATES.SEASON_3",
        widget: { stat: "defense", context: "defensive", values: WIDGET_GROWTH },
        skills: [
            { name: "Holy Warrior", ids: [202], group: "num", values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Conviction", ids: [201], group: "num", values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Exhortation", ids: [203], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Amadeus": {
        type: "Inf",
        template: "GROWTH_TEMPLATES.AMADEUS",
        widget: { stat: "attack", context: "offensive", values: WIDGET_GROWTH },
        skills: [
            { name: "Battle Ready", ids: [101], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Way of the Blade", ids: [102], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Unrighteous Strike", ids: [102], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0}
        ]
    },
    "Helga": {
        type: "Inf",
        template: "GROWTH_TEMPLATES.SEASON_1",
        widget: { stat: "lethality", context: "offensive", values: WIDGET_GROWTH },
        skills: [
            { name: "Oath of Guardian", ids: [201], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0},
            { name: "Echoes of Valhalla", ids: [102], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0},
            { name: "Nature's Balance", ids: [101], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    },
    "Jaeger": {
        type: "Arc",
        template: "GROWTH_TEMPLATES.SEASON_3",
        widget: { stat: "health", context: "defensive", values: WIDGET_GROWTH },
        skills: [
            { name: "The Tempest", ids: [102], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => 0.2, getMagnitude: (X) => X / 100, duration: 3},
            { name: "The Resistance", ids: [202], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.2, getMagnitude: (X) => X / 100, duration: 2},
            { name: "The Celebration", ids: [203], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0}
        ]
    }
};
