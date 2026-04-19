import { WIDGET_GROWTH } from './constants.js';

export const HEROES = {
    "Zoe": {
        type: "Inf", template: "SEASON_2",
        widget: { stat: "attack", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Sundering", ids: [102], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => 0.20, getMagnitude: (X) => X / 100, duration: 3 },
            { name: "Charisma", ids: [102], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Infinite", ids: [101], group: "num", values: [10, 20, 30, 40, 50], getChance: (X) => 0.50, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Saul": {
        type: "Arc", template: "SEASON_1",
        widget: { stat: "attack", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Taskforce", ids: [204, 203], group: "den", values: [[2, 3], [4, 6], [6, 9], [8, 12], [10, 15]], getChance: (X) => 1.0, getMagnitude: (X) => [X[0] / 100, X[1] / 100], duration: 0 },
            { name: "Positional", ids: [101], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 }
        ]
    },
    "Hilde": {
        type: "Cav", template: "SEASON_2",
        widget: { stat: "health", context: "def", values: WIDGET_GROWTH },
        skills: [
            { name: "Noble Path", ids: [102, 204], group: "num", values: [[3, 2], [6, 4], [9, 6], [12, 8], [15, 10]], getChance: (X) => 1.0, getMagnitude: (X) => [X[0] / 100, X[1] / 100], duration: 0 },
            { name: "Elixir", ids: [102], group: "num", values: [120, 140, 160, 180, 200], getChance: (X) => 0.25, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Trial", ids: [201], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0 }
        ]
    },
    "Amadeus": {
        type: "Inf", template: "AMADEUS",
        widget: { stat: "attack", context: "off", values: WIDGET_GROWTH },
        skills: [
            { name: "Battle Ready", ids: [101], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Blade", ids: [102], group: "num", values: [5, 10, 15, 20, 25], getChance: (X) => 1.0, getMagnitude: (X) => X / 100, duration: 0 },
            { name: "Strike", ids: [102], group: "num", values: [8, 16, 24, 32, 40], getChance: (X) => X / 100, getMagnitude: (X) => 0.50, duration: 0 }
        ]
    }
};
