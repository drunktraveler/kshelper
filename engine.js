import { UNITS } from './units.js';
import { HEROES } from './heroes.js';
import { GROWTH_TEMPLATES, WIDGET_GROWTH } from './constants.js';

export function isAlive(a) { return ((a.inf || 0) + (a.cav || 0) + (a.arc || 0)) > 1; }

export function runCombatSim(setup, atkLuck = 'average', defLuck = 'average', nWaves = 100, isBear = false, isOptimizing = false) {
    const isStochastic = (atkLuck === 'stochastic');
    const atkP = processBatches(setup.atk.batches), defP = isBear ? {
        counts: { inf: 1000000, cav: 0, arc: 0 },
        avgBase: { inf: { atk: 0, def: 10, leth: 10, hp: 83.3333 }, cav: { atk: 0, def: 0, leth: 0, hp: 0 }, arc: { atk: 0, def: 0, leth: 0, hp: 0 } },
        weights: { inf: { t7: 1, tg3: 0, tg5: 0 }, cav: {t7:0,tg3:0,tg5:0}, arc: {t7:0,tg3:0,tg5:0} }
    } : processBatches(setup.def.batches);

    let m_cur = { ...atkP.counts }, e_cur = { ...defP.counts };
    const totalStartAtk = Object.values(m_cur).reduce((a, b) => a + b, 0);
    const totalStartDef = isBear ? 1000000 : Object.values(e_cur).reduce((a, b) => a + b, 0);
    const sq_min = Math.sqrt(Math.min(totalStartAtk, totalStartDef));

    const shift = (p, mode) => {
        if (mode === 'average' || p <= 0 || p >= 1) return p;
        const sigma = Math.sqrt((p * (1 - p)) / 12); 
        return Math.max(0, Math.min(1, mode === 'lucky' ? p + 1.96 * sigma : p - 1.96 * sigma));
    };

    let triggers = {}; 
    const m_data = getMultipliers(setup.atk, atkLuck, shift, isOptimizing, isBear, triggers);
    const e_data = isBear ? { selfMult: 1, enemyMult: 1, logs: [] } : getMultipliers(setup.def, defLuck, shift, isOptimizing, false);

    let wave = 0;
    while (isAlive(m_cur) && (isBear || isAlive(e_cur)) && wave < nWaves) {
        wave++;
        const mf = (['inf', 'cav', 'arc'].find(u => m_cur[u] >= 1) || 'arc');
        const ef = (['inf', 'cav', 'arc'].find(u => e_cur[u] >= 1) || 'arc');
        let pending = [];

        [['atk', 'def'], ['def', 'atk']].forEach(([side, target]) => {
            if (isBear && side === 'def') return; 
            const sP = (side==='atk' ? atkP : defP), tP = (side==='atk' ? defP : atkP);
            const sC = (side==='atk' ? m_cur : e_cur), tC = (side==='atk' ? e_cur : m_cur);
            const sS = setup[side], tS = setup[target], tf = (side==='atk' ? ef : mf);
            const sL = (side==='atk'?atkLuck:defLuck);
            
            // Damage = Source.SelfBuffs * Opponent.Debuffs (applied to source)
            const effectiveMult = (side === 'atk') ? (m_data.selfMult * e_data.enemyMult) : (e_data.selfMult * m_data.enemyMult);

            ['inf', 'cav', 'arc'].forEach(u => {
                if (sC[u] < 1) return;
                const b = sP.avgBase[u], w = sP.weights[u];

                const calcKills = (targetType, abilMod = 1.0) => {
                    const tb = tP.avgBase[targetType];
                    const atk = b.atk * (1 + sS.stats[u+'_att']/100), leth = b.leth * (1 + sS.stats[u+'_leth']/100);
                    let df = tb.def * (1 + tS.stats[targetType+'_def']/100), hp = tb.hp * (1 + tS.stats[targetType+'_hp']/100);
                    const interaction = (u==='inf'&&targetType=='cav') || (u==='cav'&&targetType=='arc') || (u==='arc'&&targetType=='inf') ? 1.1 : 1.0;
                    return (Math.sqrt(sC[u]) * sq_min * atk * leth * interaction * abilMod * effectiveMult) / (df * hp * 100);
                };

                let abil = 1.0;
                const roll = (p) => isStochastic ? (Math.random() < p ? 1 : 0) : shift(p, sL);

                if (u==='arc') {
                    const windP = w.tg5 ? 0.3 : (w.tg3 ? 0.2 : 0);
                    if (windP > 0) abil *= (1 + roll(windP) * 0.5);
                    if (w.t7 > 0) abil *= (1 + roll(0.1) * w.t7);
                }
                if (u==='cav') {
                    const lanceP = w.tg5 ? 0.15 : (w.tg3 ? 0.1 : 0);
                    if (lanceP > 0) abil *= (1 + roll(lanceP));
                }
                if (tf==='inf') {
                    const tw = tP.weights.inf;
                    const shieldP = tw.tg5 ? 0.375 : (tw.tg3 ? 0.25 : 0);
                    if (shieldP > 0) abil *= (1 - (roll(shieldP) * 0.36));
                }
                if (u === 'cav' && w.t7 > 0 && tC['arc'] >= 1 && tf !== 'arc' && !isBear) {
                    const bp = roll(0.2);
                    pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil) * (1 - bp)});
                    pending.push({dict: tC, unit: 'arc', amt: calcKills('arc', abil) * bp});
                } else {
                    pending.push({dict: tC, unit: tf, amt: calcKills(tf, abil)});
                }
            });
        });
        pending.forEach(p => p.dict[p.unit] = Math.max(0, p.dict[p.unit] - p.amt));
        if (isBear) break;
    }

    const finalizeLogs = (side, skillLogs, triggerTracker) => {
        const p = side === 'atk' ? atkP : defP;
        let interactions = [];
        ['inf', 'cav', 'arc'].forEach(u => {
            const w = p.weights[u];
            if (w.t7 > 0) interactions.push(`${u.toUpperCase()} T7+ (${(w.t7 * 100).toFixed(0)}%)`);
            if (w.tg3 > 0 || w.tg5 > 0) interactions.push(`${u.toUpperCase()} TG3/5 (${(Math.max(w.tg3, w.tg5)*100).toFixed(0)}%)`);
        });
        return {
            skills: skillLogs,
            troopEff: interactions.join(' | '),
            triggers: triggerTracker
        };
    };

    return { 
        m_cur, e_cur, wave, 
        atk_logs: finalizeLogs('atk', m_data.logs, triggers), 
        def_logs: finalizeLogs('def', e_data.logs, {}), // Defender triggers not tracked in this context
        totalDmg: isBear ? (1000000 - e_cur.inf) : 0 
    };
}

function processBatches(batches) {
    let totals = {inf:0,cav:0,arc:0}, avgBase = {inf:{atk:0,def:0,leth:0,hp:0},cav:{atk:0,def:0,leth:0,hp:0},arc:{atk:0,def:0,leth:0,hp:0}};
    let weights = {inf:{t7:0,tg3:0,tg5:0},cav:{t7:0,tg3:0,tg5:0},arc:{t7:0,tg3:0,tg5:0}};
    
    batches.forEach(b => {
        ['inf','cav','arc'].forEach(u => {
            const longU = u==='arc'?'archers':(u==='inf'?'infantry':'cavalry');
            const tier = b[u+'_tier'], tg = b[u+'_tg'], count = b[u];
            if (!count) return;
            const stats = UNITS[longU][tier][tg];
            totals[u] += count;
            avgBase[u].atk += stats[0] * count; 
            avgBase[u].def += stats[1] * count; 
            avgBase[u].leth += stats[2] * count; 
            avgBase[u].hp += stats[3] * count;
            if (tier >= 7) weights[u].t7 += count;
            if (tg >= 3) weights[u].tg3 += count;
            if (tg >= 5) weights[u].tg5 += count;
        });
    });
    ['inf', 'cav', 'arc'].forEach(u => { 
        if (totals[u] > 0) { 
            Object.keys(avgBase[u]).forEach(k => avgBase[u][k] /= totals[u]); 
            Object.keys(weights[u]).forEach(k => weights[u][k] /= totals[u]); 
        } 
    });
    return { counts: totals, avgBase, weights };
}

function getMultipliers(sideSetup, luckMode, shiftFn, isOptimizing, isBear, triggerTracker) {
    let selfPool = {}, enemyPool = {}, logs = [];
    const isStochastic = (luckMode === 'stochastic');

    // 1. Group lineup to apply stacking rules correctly
    const lineup = {}; 
    sideSetup.heroes.forEach((h, index) => {
        if (h.name === "None" || !HEROES[h.name]) return;
        if (!lineup[h.name]) {
            lineup[h.name] = { 
                lead: 0, 
                joiner: 0, 
                data: HEROES[h.name], 
                levels: { s1: h.s1, s2: h.s2, s3: h.s3 } 
            };
        }
        if (index < 3) lineup[h.name].lead++; 
        else lineup[h.name].joiner++;
    });

    for (const name in lineup) {
        const h = lineup[name];
        h.data.skills.forEach((s, si) => {
            // Logic: Leaders get all skills, Joiners get S1 only
            const instances = h.lead + (si === 0 ? h.joiner : 0);
            if (instances === 0) return;

            // FIXED: Corrected property access (removed .roster)
            const lvl = h.levels[`s${si+1}`] || 5;
            const x = s.values[lvl - 1];
            if (x === undefined) return;

            const p = s.getChance(x);
            const m = s.getMagnitude(x);
            
            let factor;
            if (p >= 1.0) {
                factor = instances;
            } else {
                const combinedProb = 1 - Math.pow(1 - p, instances);
                if (isStochastic) {
                    const hit = Math.random() < combinedProb ? 1 : 0;
                    if (hit) triggerTracker[`${name} ${s.name}`] = (triggerTracker[`${name} ${s.name}`] || 0) + 1;
                    factor = hit;
                } else {
                    const dur = isBear ? 1 : (s.duration || 1);
                    factor = (1 - Math.pow(1 - shiftFn(combinedProb, luckMode), dur));
                }
            }

            // Calculation for math pool (handles multi-part arrays)
            const effectiveMagnitude = Array.isArray(m) ? m.map(v => v * factor) : m * factor;

            s.ids.forEach((id, idx) => {
                if (isBear && id >= 200) return;
                const val = Array.isArray(effectiveMagnitude) ? effectiveMagnitude[idx] : effectiveMagnitude;
                if (val === 0) return;

                if (id < 200) selfPool[id] = (selfPool[id] || 0) + val;
                else enemyPool[id] = (enemyPool[id] || 0) + val;
            });

            // 2. LOGGING (Handles multi-part visibility)
            if (!isOptimizing) {
                const isPassive = p >= 1.0;
                let logVal;
                
                if (isStochastic && !isPassive) {
                    logVal = `Triggers: ${triggerTracker[`${name} ${s.name}`] || 0}`;
                } else {
                    // FIXED: Now maps all parts of Saul/Hilde skills into the log string
                    if (Array.isArray(effectiveMagnitude)) {
                        logVal = "+" + effectiveMagnitude.map(v => (v * 100).toFixed(1) + "%").join("/");
                    } else {
                        logVal = `+${(effectiveMagnitude * 100).toFixed(1)}%`;
                    }
                }
                
                logs.push({ 
                    name: `${name} ${s.name}${instances > 1 ? ' (x' + instances + ')' : ''}`, 
                    val: logVal, 
                    isPassive 
                });
            }
        });
    }

    const calc = (pool) => { 
        let m = 1.0; 
        Object.values(pool).forEach(v => { if(!isNaN(v)) m *= (1 + v); }); 
        return m; 
    };
    return { selfMult: calc(selfPool), enemyMult: calc(enemyPool), logs };
}

function getHeroData(sideSetup) {
    const lineup = {}; 
    sideSetup.heroes.forEach((h, index) => {
        if (h.name === "None" || !HEROES[h.name]) return;
        if (!lineup[h.name]) {
            lineup[h.name] = { lead: 0, joiner: 0, data: HEROES[h.name], levels: { s1: h.s1, s2: h.s2, s3: h.s3 } };
        }
        if (index < 3) lineup[h.name].lead++; else lineup[h.name].joiner++;
    });

    let passives = { self: {}, enemy: {} }, actives = [];
    for (const name in lineup) {
        const h = lineup[name];
        h.data.skills.forEach((s, si) => {
            const instances = h.lead + (si === 0 ? h.joiner : 0);
            if (instances === 0) return;
            const lvl = h.levels[`s${si+1}`] || 5;
            const x = s.values[lvl - 1];
            const p = s.getChance(x), m = s.getMagnitude(x);

            if (p >= 1.0) {
                // PASSIVE: Magnitude * instances (Additive)
                s.ids.forEach((id, idx) => {
                    const val = (Array.isArray(m) ? m[idx] : m) * instances;
                    const pool = id < 200 ? passives.self : passives.enemy;
                    pool[id] = (pool[id] || 0) + val;
                });
            } else {
                // ACTIVE: Stored for the wave loop
                actives.push({ name: `${name} ${s.name}`, p, m, ids: s.ids, duration: s.duration || 1, instances });
            }
        });
    }
    return { passives, actives };
}
