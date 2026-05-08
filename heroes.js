import { WIDGET_GROWTH } from './constants.js';

export const HEROES = {
    // Add to HEROES in heroes.js
    "Rosa": {
        type: "Arc",
        template: "SEASON_4",
        widget: { stat: "lethality", context: "off", values: WIDGET_GROWTH },
        skills: [
            { name: "Chaos Gambit", ids: [101], values: [10, 20, 30, 40, 50], getChance: (X) => 0.4, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Rose of War", ids: [201], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Golden Rhythm", ids: [102], values: [6, 12, 18, 24, 30], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Alcar": {
        type: "Inf",
        template: "SEASON_4",
        widget: { stat: "health", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Rescuing Hands", ids: [201], values: [14, 28, 42, 56, 70], getChance: (X) => 1.0, getMagnitude: (X) => ({ inf: X/100, cav: 0, arc: X/100 }), duration: 2, uptime: 0.4 },
            { name: "Praetorian Will", ids: [101], values: [20, 40, 60, 80, 100], getChance: (X) => 1.0, getMagnitude: (X) => ({ inf: X/100, cav: 0.1, arc: 0.1 }), duration: 0 },
            { name: "Carpe Diem", ids: [101], values: [12, 24, 36, 48, 60], getChance: (X) => 1.0, getMagnitude: (X) => ({ inf: X/100, cav: 0.25, arc: 0.25 }), duration: 0 }
        ]
    },
    "Margot": {
        type: "Cav",
        template: "SEASON_4",
        widget: { stat: "lethality", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Iron Maiden", ids: [102], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Shield of Grace", ids: [206], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Second Strike", ids: [101], values: [120, 140, 160, 180, 200], getChance: (X) => 0.25, getMagnitude: (X) => ({ inf: 0, cav: (X+100)/100, arc: 0 }), duration: 0 }
        ]
    },
    "Zoe": {
        type: "Inf",
        template: "SEASON_2",
        widget: { stat: "attack", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Sundering", ids: [102], values: [8, 16, 24, 32, 40], getChance: (X) => 0.20, getMagnitude: (X) => X / 100, duration: 3 },
            { name: "Charisma", ids: [102], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Infinite", ids: [101], values: [10, 20, 30, 40, 50], getChance: (X) => 0.50, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Marlin": {
        type: "Arc",
        template: "SEASON_2",
        widget: { stat: "lethality", context: "off", values: WIDGET_GROWTH },
        skills: [
            { name: "Wild Card", ids: [102], values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0 },
            { name: "Rumhead", ids: [202], values: [10, 20, 30, 40, 50], getChance: (X) => 0.2, getMagnitude: (X) => X / 100, duration: 2 },
            { name: "Dynamo", ids: [101], values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Jabel": {
        type: "Cav",
        template: "SEASON_1",
        widget: { stat: "lethality", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Rally Flag", ids: [201], values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0 },
            { name: "Hero's Domain", ids: [101], values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Youthful Rage", ids: [101], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Howard": {
        type: "Inf",
        template: "SR",
        skills: [
            { name: "Defender", ids: [201], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Weaken", ids: [202], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Chenko": {
        type: "Cav",
        template: "SR",
        skills: [
            { name: "Stand of Arms", ids: [101], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Shield Wall", ids: [201], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Quinn": {
        type: "Arc",
        template: "SR",
        skills: [
            { name: "Sixth Sense", ids: [201], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Precision Shot", ids: [101], values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Gordon": {
        type: "Cav",
        template: "SR",
        skills: [
            { name: "Super Nutrients", ids: [203], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Trash Talk", ids: [102], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Petra": {
        type: "Cav",
        template: "SEASON_3",
        widget: { stat: "attack", context: "off", values: WIDGET_GROWTH },
        skills: [
            { name: "Evil Eye", ids: [101], values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "The Favor", ids: [101], values: [10, 20, 30, 40, 50], getChance: (X) => 0.5, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "The Shield", ids: [201], values: [10, 20, 30, 40, 50], getChance: (X) => 0.4, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Amane": {
        type: "Arc",
        template: "SR",
        skills: [
            { name: "Tri-Phalanx", ids: [102], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Yeonwoo": {
        type: "Arc",
        template: "SR",
        skills: [
            { name: "On Guard", ids: [101], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Saul": {
        type: "Arc",
        template: "SEASON_1",
        widget: { stat: "attack", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Taskforce", ids: [204, 203], values: [[2, 3], [4, 6], [6, 9], [8, 12], [10, 15]], getChance: (X) => 1.0, getMagnitude: (X) => [X[0] / 100, X[1] / 100], duration: 0 },
            { name: "Positional", ids: [101], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Fahd": {
        type: "Cav",
        template: "SR",
        skills: [
            { name: "Desert Eclipse", ids: [205], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Hilde": {
        type: "Cav",
        template: "SEASON_2",
        widget: { stat: "health", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Noble Path", ids: [102, 204], values: [[3, 2], [6, 4], [9, 6], [12, 8], [15, 10]], getChance: (X) => 1.0, getMagnitude: (X) => [X[0] / 100, X[1] / 100], duration: 0 },
            { name: "Elixir of Strength", ids: [102], values: [120, 140, 160, 180, 200], getChance: (X) => 0.25, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Trial by Fire", ids: [201], values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0 }
        ]
    },
    "Eric": {
        type: "Inf",
        template: "SEASON_3",
        widget: { stat: "defense", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Holy Warrior", ids: [202], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Conviction", ids: [201], values: [4, 8, 12, 16, 20], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Exhortation", ids: [203], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Amadeus": {
        type: "Inf",
        template: "AMADEUS",
        widget: { stat: "attack", context: "off", values: WIDGET_GROWTH },
        skills: [
            { name: "Battle Ready", ids: [101], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Way of the Blade", ids: [102], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Unrighteous Strike", ids: [102], values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0 }
        ]
    },
    "Helga": {
        type: "Inf",
        template: "SEASON_1",
        widget: { stat: "lethality", context: "off", values: WIDGET_GROWTH },
        skills: [
            { name: "Oath of Guardian", ids: [201], values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0 },
            { name: "Echoes of Valhalla", ids: [102], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Nature's Balance", ids: [101], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Jaeger": {
        type: "Arc",
        template: "SEASON_3",
        widget: { stat: "health", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "The Tempest", ids: [102], values: [8, 16, 24, 32, 40], getChance: (X) => 0.2, getMagnitude: (X) => X / 100, duration: 3 },
            { name: "The Resistance", ids: [202], values: [10, 20, 30, 40, 50], getChance: (X) => 0.2, getMagnitude: (X) => X / 100, duration: 2 },
            { name: "The Celebration", ids: [203], values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    }
};
